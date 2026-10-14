function usePreventSelect() {
  function clearSelection() {
    window?.getSelection()?.removeAllRanges();
    // @ts-expect-error
    document?.selection?.empty();
  }
  function preventSelect() {
    clearSelection();
    document.body.classList.add("no-select");
  }

  function resumeSelect() {
    document.body.classList.remove("no-select");
  }

  return [preventSelect, resumeSelect];
}

export default usePreventSelect;
