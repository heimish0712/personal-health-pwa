// Transfer only compatible keys to the next template; common form fields live outside it.
export function compatibleDraft(previousFields, nextFields, values) {
  const previous = new Map(previousFields.map((f) => [f.key, f]));
  return Object.fromEntries(nextFields.filter((field) => {
    const old = previous.get(field.key);
    if (!old || old.type !== field.type || !Object.hasOwn(values, field.key)) return false;
    if (field.type === 'select' && !(field.options ?? []).includes(values[field.key])) return false;
    return true;
  }).map((field) => [field.key, values[field.key]]));
}
