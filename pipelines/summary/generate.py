"""Write the weekly summary with Claude from the warehouse facts, then let the number guard approve it.

Runs only when ANTHROPIC_API_KEY is set (a client deployment). Without a key the committed summary is kept,
and the number guard still re-checks every figure in it against this run's facts.
"""
import json
import os
import pathlib
import sys

FACTS = pathlib.Path("build/site/data/report_week.json")
OUT = pathlib.Path("site/email/summary.json")
PROMPT = pathlib.Path("pipelines/summary/prompt.md")


def main() -> int:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("no ANTHROPIC_API_KEY: keeping the committed summary; the number guard will still check it")
        return 0
    import anthropic

    client = anthropic.Anthropic()
    response = client.beta.messages.create(
        model="claude-opus-5-5",
        max_tokens=16000,
        output_config={"effort": "medium"},
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        system=PROMPT.read_text(),
        messages=[{"role": "user", "content": FACTS.read_text()}],
    )
    if response.stop_reason == "refusal":
        print(f"model declined: {response.stop_details}; keeping the previous summary")
        return 1
    text = "".join(b.text for b in response.content if b.type == "text").strip()
    summary = json.loads(text.removeprefix("```json").removesuffix("```").strip())
    summary["written_by"] = response.model
    OUT.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n")
    print(f"summary written by {response.model}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
