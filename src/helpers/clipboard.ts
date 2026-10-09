/** Copy text for the user to paste elsewhere, throws when the browser refuses */
export async function copyText(text: string) {
  // The clipboard api is missing on a page loaded over http from another machine
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const input = document.createElement("textarea");
  input.value = text;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(input);
  if (!copied) {
    throw new Error("Unable to copy");
  }
}
