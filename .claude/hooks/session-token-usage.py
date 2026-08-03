#!/usr/bin/env python3
"""SessionStart hook: 直近のトークン消費を model 別に集計してコンテキストへ注入する。

`~/.claude/projects/**/*.jsonl` の usage レコードを全 project 横断で読む。
委譲が実運用されているか（= 下位 tier の構成比が上がっているか）をセッション
開始時に可視化するのが目的なので、集計は消費量と構成比だけを出す。上限（分母）は
ローカルに存在しないため、残量やパーセンテージの「使用率」は出さない。

bash + jq ではなく python3 なのは、146MB 規模の JSONL を 1 パスで読みながら
message.id の重複排除と時刻窓の切り分けをする必要があるため（jq を全行に
かけるより速く、ロジックも追いやすい）。

失敗しても session 開始を邪魔しないよう、例外は握りつぶして exit 0 する。
"""

import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone

PROJECTS_DIR = os.path.expanduser("~/.claude/projects")

WINDOW_DAYS = 7
WINDOW_HOURS = 5

# 直近 7 日のレコードを含みうるファイルだけ開く。タイムゾーン差と
# 追記のずれを吸収するため mtime は 1 日多く取る。
MTIME_WINDOW_SEC = (WINDOW_DAYS + 1) * 86400

# アーカイブは増え続けるので、走査が session 開始を待たせないよう上限を置く。
TIME_BUDGET_SEC = 5.0

# 短いラベルへ畳む。将来モデルが増えても素通しできるよう部分一致で判定する。
MODEL_LABELS = ("haiku", "sonnet", "opus", "fable", "mythos")


def parse_timestamp(raw):
    """'2026-07-29T21:52:07.612Z' → naive UTC datetime。解析できなければ None。

    system python が 3.9 系で fromisoformat が 'Z' を扱えないため、秒までを
    切り出して読む。窓の判定は 5 時間 / 7 日単位なので秒未満は捨ててよい。
    """
    if not raw or len(raw) < 19:
        return None
    try:
        return datetime.strptime(raw[:19], "%Y-%m-%dT%H:%M:%S")
    except ValueError:
        return None


def normalize_model(raw):
    """model 名を短いラベルへ畳む。集計対象外なら None。"""
    if not raw:
        return None
    name = raw.lower()
    if name.startswith("<"):  # <synthetic> など、課金されない内部レコード
        return None
    for label in MODEL_LABELS:
        if label in name:
            return label
    return raw[:24]


def collect():
    """(集計結果, 走査打ち切りフラグ) を返す。"""
    # 記録側が UTC なので naive UTC に揃える（utcnow() は将来の python で
    # DeprecationWarning を stderr に出すため使わない）。
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    cutoffs = {
        "week": now - timedelta(days=WINDOW_DAYS),
        "recent": now - timedelta(hours=WINDOW_HOURS),
    }
    mtime_cutoff = time.time() - MTIME_WINDOW_SEC
    deadline = time.monotonic() + TIME_BUDGET_SEC

    seen = set()
    stats = {}
    truncated = False

    for dirpath, _dirnames, filenames in os.walk(PROJECTS_DIR):
        for filename in filenames:
            if not filename.endswith(".jsonl"):
                continue
            path = os.path.join(dirpath, filename)
            try:
                if os.path.getmtime(path) < mtime_cutoff:
                    continue
            except OSError:
                continue

            if time.monotonic() > deadline:
                truncated = True
                return stats, truncated

            try:
                with open(path, "r", encoding="utf-8", errors="replace") as handle:
                    for lineno, line in enumerate(handle):
                        # ファイル単位の判定だけでは budget を守れない。1 本の
                        # session log が上限を超えて育つと、そのファイルを読み切る
                        # まで戻れず SessionStart を待たせる。行ループの中でも見る。
                        # 毎行 monotonic() を呼ぶと本末転倒なので間引く。
                        if lineno % 2000 == 0 and time.monotonic() > deadline:
                            return stats, True

                        # 全行を JSON parse すると遅いので、usage を持つ行だけ通す。
                        if '"output_tokens"' not in line:
                            continue
                        try:
                            record = json.loads(line)
                        except ValueError:
                            continue

                        message = record.get("message") or {}
                        usage = message.get("usage") or {}

                        # 同一レコードが複数回書かれるため message.id で重複排除する。
                        message_id = message.get("id")
                        if not message_id or message_id in seen:
                            continue
                        seen.add(message_id)

                        stamp = parse_timestamp(record.get("timestamp"))
                        if stamp is None:
                            continue
                        model = normalize_model(message.get("model"))
                        if model is None:
                            continue

                        output = usage.get("output_tokens") or 0
                        cache_read = usage.get("cache_read_input_tokens") or 0

                        for window, cutoff in cutoffs.items():
                            if stamp >= cutoff:
                                bucket = stats.setdefault(
                                    model, {"week": [0, 0], "recent": [0, 0]}
                                )[window]
                                bucket[0] += output
                                bucket[1] += cache_read
            except OSError:
                continue

    return stats, truncated


def human(value):
    if value >= 1_000_000_000:
        return "{:.2f}B".format(value / 1_000_000_000)
    if value >= 1_000_000:
        return "{:.2f}M".format(value / 1_000_000)
    if value >= 1_000:
        return "{:.1f}k".format(value / 1_000)
    return str(value)


def share(value, total):
    if not total:
        return "—"
    return "{:.1f}%".format(value * 100.0 / total)


def render(stats, truncated):
    week_total = sum(v["week"][0] for v in stats.values())
    recent_total = sum(v["recent"][0] for v in stats.values())
    if not week_total and not recent_total:
        return

    rows = sorted(stats.items(), key=lambda item: -item[1]["week"][0])
    rows = [r for r in rows if r[1]["week"][0] or r[1]["recent"][0]]

    print("")
    print("### Token usage（全 project 横断）")
    print("")
    print("| Model | {}d output | 構成比 | {}h output | 構成比 |".format(WINDOW_DAYS, WINDOW_HOURS))
    print("| --- | --- | --- | --- | --- |")
    for model, data in rows:
        print(
            "| {} | {} | {} | {} | {} |".format(
                model,
                human(data["week"][0]),
                share(data["week"][0], week_total),
                human(data["recent"][0]),
                share(data["recent"][0], recent_total),
            )
        )

    week_cache = sum(v["week"][1] for v in stats.values())
    recent_cache = sum(v["recent"][1] for v in stats.values())
    print("")
    print(
        "**Cache read**: {}d {} / {}h {}（上限はローカルに無いため消費量と構成比のみ）".format(
            WINDOW_DAYS, human(week_cache), WINDOW_HOURS, human(recent_cache)
        )
    )
    if truncated:
        print("")
        print("> 走査が時間上限に達したため、上記は部分集計。")


def main():
    if not os.path.isdir(PROJECTS_DIR):
        return
    stats, truncated = collect()
    render(stats, truncated)


if __name__ == "__main__":
    try:
        main()
    except Exception:  # hook が session 開始を止めないよう握りつぶす
        pass
    sys.exit(0)
