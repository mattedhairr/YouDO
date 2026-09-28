// JSON.parse silently drops repeated keys. Detect them before importing a tree.
function decode(text: string, notes: string[]): { value?: unknown; notes: string[]; error?: string } {
  const value: unknown = JSON.parse(text);
  const objects: Array<Set<string> | null> = [];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '{') objects.push(new Set());
    else if (text[i] === '[') objects.push(null);
    else if (text[i] === '}' || text[i] === ']') objects.pop();
    else if (text[i] === '"') {
      const start = i++;
      for (; i < text.length; i += 1) {
        if (text[i] === '\\') i += 1;
        else if (text[i] === '"') break;
      }
      if (/^\s*:/.test(text.slice(i + 1))) {
        const key = JSON.parse(text.slice(start, i + 1)) as string;
        const keys = objects[objects.length - 1];
        if (keys?.has(key)) return { notes, error: `The JSON repeats the field “${key}” in one item. Ask the AI to combine its content into one field; importing it could lose part of the plan.` };
        keys?.add(key);
      }
    }
  }
  return { value, notes };
}

/** Extract one complete response without guessing missing plan content. */
export function readPlanJSON(input: string): { value?: unknown; notes: string[]; error?: string } {
  const notes: string[] = [];
  let text = input.replace(/^\uFEFF/, '').trim();
  if (!text) return { notes, error: 'Paste the complete AI response, or choose its JSON file.' };
  const fences = [...text.matchAll(/```([^\r\n`]*)\r?\n([\s\S]*?)```/g)];
  if (fences.length > 1) return { notes, error: 'There is more than one code block. Copy only the final plan, or ask the AI for one complete JSON block.' };
  if (fences.length === 1) {
    const block = fences[0];
    if (!['', 'json'].includes(block[1].trim().toLowerCase())) return { notes, error: 'Choose the JSON plan, not a script or another file type.' };
    const outside = text.slice(0, block.index) + text.slice((block.index ?? 0) + block[0].length);
    if (/[{}[\]`]/.test(outside)) return { notes, error: 'The response contains extra code outside the plan. Copy only the final JSON block.' };
    text = block[2].trim();
    notes.push('Removed the code-block wrapper.');
  } else if (text.includes('```') && !text.startsWith('{')) {
    return { notes, error: 'The code block looks unfinished. Wait for the AI to finish, then copy the whole result again.' };
  }
  // Some tools add a sentence around raw JSON. Accept only one unambiguous object.
  if (!text.startsWith('{') && !text.startsWith('[')) {
    const start = text.indexOf('{');
    if (start < 0 || /[[\]}`]/.test(text.slice(0, start))) return { notes, error: 'Paste one valid JSON plan. Use the Copy button on the AI’s final code block.' };
    text = text.slice(start);
    notes.push('Removed the introduction before the JSON.');
  }
  let quoted = false;
  let escaped = false;
  const stack: string[] = [];
  let end = -1;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === '{' || char === '[') stack.push(char);
    else if (char === '}' || char === ']') {
      if (stack.pop() !== (char === '}' ? '{' : '[')) return { notes, error: 'A bracket is in the wrong place. Use “Copy correction prompt” to ask the AI to repair the complete plan.' };
      if (!stack.length) { end = i + 1; break; }
    }
  }
  if (end < 0 || quoted || stack.length) return { notes, error: 'This plan appears cut off: a quote or closing bracket is missing. Wait for the full response, or ask for a shorter complete plan with the correction prompt.' };
  const after = text.slice(end).trim();
  if (after && /[{}[\]`]/.test(after)) return { notes, error: 'More than one JSON fragment was pasted. Copy just one complete plan; do not join separate responses.' };
  if (after) notes.push('Removed the explanation after the JSON.');
  text = text.slice(0, end);
  try { return decode(text, notes); }
  catch { /* Retry only a lossless punctuation correction outside strings. */ }
  let normalized = '';
  quoted = false;
  escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (!quoted && char === ',' && /^\s*[}\]]/.test(text.slice(i + 1))) continue;
    normalized += char;
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
  }
  try {
    return decode(normalized, [...notes, 'Removed trailing commas; plan text is unchanged.']);
  } catch (error) {
    const position = error instanceof Error ? error.message.match(/position (\d+)/)?.[1] : undefined;
    const line = position ? normalized.slice(0, Number(position)).split('\n').length : undefined;
    return { notes, error: `The JSON has a syntax error${line ? ` near line ${line}` : ''}. Copy the complete code block again, or use “Copy correction prompt”. You do not need to edit the JSON yourself.` };
  }
}
