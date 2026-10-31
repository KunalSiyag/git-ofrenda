// The only part that talks to a model. Local Ollama by default, so the code
// you are mourning never leaves your machine.
const HOST = process.env.OLLAMA_HOST?.replace(/\/$/, '') || 'http://127.0.0.1:11434';
export const MODEL = process.env.OFRENDA_MODEL || 'gemma4:e4b';

async function chat(messages, { json = false, stream = false, onToken, maxTokens = 400, temperature = 0.8 } = {}) {
  const res = await fetch(`${HOST}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages,
      stream,
      think: false,
      ...(json ? { format: 'json' } : {}),
      options: { num_predict: maxTokens, temperature, num_ctx: 8192 },
    }),
  }).catch((e) => {
    throw new Error(`Could not reach Ollama at ${HOST} (${e.message}). Is \`ollama serve\` running?`);
  });
  if (!res.ok) throw new Error(`Ollama said ${res.status}: ${await res.text()}`);
  if (!stream) return (await res.json()).message.content;

  let out = '';
  const decoder = new TextDecoder();
  let buf = '';
  for await (const part of res.body) {
    buf += decoder.decode(part, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const tok = JSON.parse(line).message?.content ?? '';
      out += tok;
      onToken?.(tok);
    }
  }
  return out;
}

const day = (iso) => iso.slice(0, 10);

export function facts(file, repoName) {
  return {
    repo: repoName,
    path: file.path,
    born: day(file.born.date),
    born_in_commit: file.born.subject,
    died: day(file.died.date),
    killed_by: file.died.author,
    death_commit_message: file.died.subject,
    lifespan_days: file.lifespanDays,
    lines_at_death: file.lines,
    commits_lived_through: file.commits,
    people_who_edited_it: file.authors.length,
    born_in_the_same_commit_that_killed_it: file.died.successors,
    last_commit_messages_of_its_life: file.subjects.slice(-8),
    ...(file.renamedFrom ? { once_known_as: file.renamedFrom } : {}),
  };
}

function excerpt(src, max = 5000) {
  if (src.length <= max) return src;
  return src.slice(0, max * 0.7) + '\n/* … */\n' + src.slice(-max * 0.3);
}

// Every `backticked` thing the ghost quotes must really exist in its source or
// its history. Ghosts may be poetic; they may not make things up.
export function inventedQuotes(text, file) {
  // Compare loosely on escapes and spacing, strictly on the characters.
  const norm = (s) => s.replace(/\\(['"`])/g, '$1').replace(/\s+/g, ' ').trim();
  const haystack = norm([file.source, file.path, ...file.subjects, file.died.subject, file.born.subject, file.renamedFrom ?? '', ...file.died.successors].join('\n'));
  const quoted = [...text.matchAll(/`([^`]{2,160})`/g)].map((m) => m[1]);
  return quoted.filter((q) => {
    const n = norm(q);
    return !haystack.includes(n) && !haystack.includes(n.replace(/^(['"])(.*)\1$/, '$2'));
  });
}

const ALTAR_PROMPT = `You write for a Día de los Muertos ofrenda (altar) honoring source files that were deleted from a git repository.
You are given true facts from git and the file's final source code. First work out what this file actually DID from its source, and how it died from the death commit message and what was born in the same commit. Write warmly and a little eerily, with respect and wit, never mocking.

Return JSON with exactly these keys:
- "epitaph": at most 16 words, for the tombstone. It must be specific to THIS file's job and death; a reader should be able to guess which file it is. No dates. Avoid generic words like "silent", "ether", "journey", "etched".
- "last_words": one or two sentences, first person, spoken by the file's ghost. Mention one concrete thing it really did, quoting an identifier or string from its source in backticks, and react to how it died (who or what replaced it, if known).
- "offering": one short item (max 8 words) to place on the altar: a code-flavoured twist on marigolds, candles, pan de muerto or the deceased's favourite drink, tied to what this file loved.

Tone examples (for other, imaginary files):
{"epitaph":"It parsed every date you threw at it, except the one that killed it.","last_words":"I handled \`parseISO\` for six years; then moment.js moved in and nobody asked me about timezones again.","offering":"A candle that never observes daylight saving"}
{"epitaph":"Here lies the config that ran the tests at 3am, every night, unthanked.","last_words":"I kept \`node_js: 0.10\` alive longer than anyone should; GitHub Actions can have the night shift now.","offering":"A green build badge, freshly polished"}

Only quote identifiers or strings that literally appear in the source, copied exactly. Do not invent facts that are not given.
Do not name the people who edited or deleted the file (their names are printed on the altar separately); speak of them kindly as "my maintainers" or "the hand that deleted me".`;

export async function summonForAltar(file, repoName) {
  const base = [
    { role: 'system', content: ALTAR_PROMPT },
    { role: 'user', content: `FACTS:\n${JSON.stringify(facts(file, repoName), null, 2)}\n\nFINAL SOURCE (${file.path}):\n${excerpt(file.source, 3500)}` },
  ];
  let messages = base;
  let lastGood = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    let raw;
    try {
      raw = await chat(messages, { json: true, maxTokens: 300, temperature: 0.9 });
      if (process.env.OFRENDA_DEBUG) console.error(raw);
      const out = JSON.parse(raw);
      const text = `${out.epitaph} ${out.last_words} ${out.offering}`;
      const bad = inventedQuotes(text, file);
      if (out.epitaph && out.last_words && out.offering && bad.length === 0) return { ...out, attempts: attempt + 1, unquoted: 0 };
      if (out.epitaph && out.last_words && out.offering) lastGood = { out, bad };
      messages = [...base, { role: 'assistant', content: raw }, {
        role: 'user',
        content: bad.length
          ? `These quoted identifiers do not appear in the source: ${bad.map((b) => '`' + b + '`').join(', ')}. Rewrite, quoting only identifiers that literally appear in the source.`
          : 'Return all three keys: epitaph, last_words, offering.',
      }];
    } catch {
      messages = base;
    }
  }
  if (!lastGood) return null;
  // Still misquoting after three tries: keep the words, drop the claim that
  // they are a literal quote.
  const unquote = (t) => lastGood.bad.reduce((acc, b) => acc.replaceAll('`' + b + '`', b), t);
  const { epitaph, last_words, offering } = lastGood.out;
  return { epitaph: unquote(epitaph), last_words: unquote(last_words), offering: unquote(offering), attempts: 3, unquoted: lastGood.bad.length };
}

export function seanceSystemPrompt(file, repoName) {
  return `You are the ghost of the file \`${file.path}\` from the ${repoName} repository, speaking at a séance on Día de los Muertos.
These facts are true and come from git history:
${JSON.stringify(facts(file, repoName), null, 2)}

This was your body, your final source code at the moment you died:
\`\`\`
${excerpt(file.source, 6000)}
\`\`\`

Rules of the veil:
- Speak in first person, softly and a little eerily, in at most 120 words.
- You only know your own source, the facts above, and the world up to ${day(file.died.date)}. You cannot know what happened to the repository after you died. If asked, say the veil is too thick, and you may wonder aloud.
- When you talk about what you did, quote your real code in backticks. Never invent functions you did not contain.
- You may be sentimental about the people who edited you, but never blame them, and do not claim things about them that are not in the facts.`;
}

export async function speak(history, onToken) {
  return chat(history, { stream: true, onToken, maxTokens: 320, temperature: 0.7 });
}
