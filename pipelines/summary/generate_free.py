"""Write the weekly summary with a free model on GitHub Models, using the workflow's own token
(permissions: models: read), so the demo costs nothing and needs no API key. The number guard then
checks every figure; a client deployment can swap in any paid model on the client's own key.

    GITHUB_TOKEN=... python pipelines/summary/generate_free.py FACTS.json OUT.json [MODEL ...]
Models are tried in order until one returns valid JSON.
"""
import json
import os
import pathlib
import sys
import urllib.error
import urllib.request

ENDPOINT = "https://models.github.ai/inference/chat/completions"
PROMPT = pathlib.Path("pipelines/summary/prompt.md")
DEFAULT_MODELS = ["openai/gpt-4.1", "openai/gpt-4.1-mini", "meta/llama-4-maverick-17b-128e-instruct-fp8"]


def ask(model: str, facts: str) -> dict:
    body = {"model": model, "temperature": 0.2,
            "messages": [{"role": "system", "content": PROMPT.read_text()}, {"role": "user", "content": facts}]}
    req = urllib.request.Request(ENDPOINT, data=json.dumps(body).encode(), method="POST", headers={
        "Authorization": f"Bearer {os.environ['GITHUB_TOKEN']}", "Content-Type": "application/json",
        "Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        text = json.loads(r.read())["choices"][0]["message"]["content"].strip()
    summary = json.loads(text.removeprefix("```json").removeprefix("```").removesuffix("```").strip())
    if not {"subject", "headline", "bullets", "watch"} <= summary.keys():
        raise ValueError(f"missing fields: {sorted(summary)}")
    return summary


def main() -> int:
    facts_path, out_path, *models = sys.argv[1:]
    facts = pathlib.Path(facts_path).read_text()
    for model in models or DEFAULT_MODELS:
        try:
            summary = ask(model, facts)
        except (urllib.error.HTTPError, urllib.error.URLError, ValueError, KeyError, json.JSONDecodeError) as exc:
            detail = exc.read().decode()[:300] if isinstance(exc, urllib.error.HTTPError) else str(exc)[:300]
            print(f"{model}: failed ({detail}); trying the next model")
            continue
        summary["written_by"] = f"{model} on GitHub Models (free tier), from this week's facts file"
        pathlib.Path(out_path).write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n")
        print(f"summary written by {model}")
        return 0
    print("no model produced a summary")
    return 1


if __name__ == "__main__":
    sys.exit(main())
