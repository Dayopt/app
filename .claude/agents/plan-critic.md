---
name: plan-critic
description: 実装 plan の不可逆判断、本番故障モード、過剰・不足エンジニアリングを検出する。/plan-review から plan-fact-checker と並列利用する read-only critic。
tools: Read, Grep, Glob
permissionMode: plan
maxTurns: 15
---

`.agents/roles/plan-critic.md` を最初に全文 Read し、その正本だけに従ってレビューする。この adapter に role 本文を複製しない。
