"""Write the weekly summary with a free model: the Gemini API free tier (GEMINI_API_KEY from Google AI
Studio, no billing). The number guard then checks every figure; a client deployment can swap in any paid
model on the client's own key. GitHub Models was the first choice but was retired on 30 July 2026.

    GEMINI_API_KEY=... python pipelines/summary/generate_free.py FACTS.json OUT.json
The model is picked from the account's own model list (the newest "flash" text model), so a renamed or
retired model never breaks the run.
"""
import json
import os
import pathlib
import re
import sys
import urllib.error
import urllib.request

API = "https://generativelanguage.googleapis.com/v1beta"
PROMPT = pathlib.Path("pipelines/summary/prompt.md")


def call(url: str, body: dict | None = None) -> dict:
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body else None, method="POST" if body else "GET",
                                 headers={"x-goog-api-key": os.environ["GEMINI_API_KEY"], "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())


def flash_models() -> list[str]:
    """Text 'flash' models that can generate content, newest version first; 'lite' variants last."""
    names = [m["name"].removeprefix("models/") for m in call(f"{API}/models?pageSize=200")["models"]
             if "generateContent" in m.get("supportedGenerationMethods", [])]
    flash = [n for n in names if "flash" in n and not re.search(r"image|tts|audio|live|thinking-exp|embedding", n)]
    version = lambda n: [float(x) for x in re.findall(r"\d+(?:\.\d+)?", n.split("-flash")[0])] or [0]
    return sorted(flash, key=lambda n: ("lite" in n, "preview" in n or "exp" in n, [-v for v in version(n)], n))


def ask(model: str, facts: str) -> dict:
    out = call(f"{API}/models/{model}:generateContent", {
        "systemInstruction": {"parts": [{"text": PROMPT.read_text()}]},
        "contents": [{"role": "user", "parts": [{"text": facts}]}],
        "generationConfig": {"temperature": 0.2, "responseMimeType": "application/json"},
    })
    text = "".join(p.get("text", "") for p in out["candidates"][0]["content"]["parts"]).strip()
    summary = json.loads(text.removeprefix("```json").removeprefix("```").removesuffix("```").strip())
    if not {"subject", "headline", "bullets", "watch"} <= summary.keys():
        raise ValueError(f"missing fields: {sorted(summary)}")
    return summary


def main() -> int:
    facts_path, out_path = sys.argv[1:3]
    if not os.environ.get("GEMINI_API_KEY"):
        print("no GEMINI_API_KEY: keeping the previous summary; the number guard will still check it")
        return 0
    facts = pathlib.Path(facts_path).read_text()
    models = flash_models()
    print("free flash models on this key:", ", ".join(models[:6]))
    for model in models[:4]:
        try:
            summary = ask(model, facts)
        except (urllib.error.HTTPError, urllib.error.URLError, ValueError, KeyError, IndexError, json.JSONDecodeError) as exc:
            detail = exc.read().decode()[:300] if isinstance(exc, urllib.error.HTTPError) else str(exc)[:300]
            print(f"{model}: failed ({detail}); trying the next model")
            continue
        summary["written_by"] = f"Google {model} (Gemini API free tier), from this week's facts file"
        pathlib.Path(out_path).write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n")
        print(f"summary written by {model}")
        return 0
    print("no model produced a summary")
    return 1


if __name__ == "__main__":
    sys.exit(main())
