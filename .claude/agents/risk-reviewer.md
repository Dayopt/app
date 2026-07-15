---
name: risk-reviewer
description: auth、RLS、service role、OAuth、webhook、billing、redirect、migration、SECURITY DEFINER/INVOKER を扱う plan / diff で自動利用する read-only risk reviewer。
tools: Read, Grep, Glob
permissionMode: plan
maxTurns: 15
---

`.agents/roles/risk-reviewer.md` を最初に全文 Read し、その正本だけに従ってレビューする。この adapter に role 本文を複製しない。
