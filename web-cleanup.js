/* Removes connection-only UI from the shared dashboard shell. */
(() => {
  const replacements = new Map([
    ['Sample data', 'Browser workspace'], ['SAMPLE DATA', 'BROWSER DATA'], ['Sample roster', 'Browser roster'],
    ['Sample ID', 'Browser ID'],
    ['Sample workspace', 'Browser workspace'], ['Standalone preview', 'Browser workspace'], ['Illustrative sample data. Separate from your live workspace.', 'Data is stored in this browser.'],
    ['Import Outreach calls', 'Import call CSV'], ['Upload an Outreach call-list CSV', 'Upload a call-list CSV'],
    ['Outreach call-list CSV', 'call-list CSV'], ['Bring your call activity into one shared workspace.', 'Your CSV data is stored in this browser.'],
    ['Call duration is different from a connected conversation.', 'Call duration is reported separately from dial credits.'],
    ['Add a team member for manual time, import calls, or connect Outreach to build your roster.', 'Add a team member for manual time or import a call CSV.'],
    ['These rules apply to the sample workspace.', 'These rules apply to this browser workspace.'],
    ['Changes affect sample data only.', 'Changes are saved in this browser.'],
  ]);
  function clean(root = document) {
    root.querySelectorAll('[data-nav="integration"]').forEach(node => node.remove());
    root.querySelectorAll('[data-action="connect"], [data-action="sync"], [data-action="webhooks"], [data-action="disconnect"], #refresh-integration').forEach(node => node.remove());
    root.querySelectorAll('#duration-mode, #duration-field-row').forEach(node => node.closest('.field')?.remove() || node.remove());
    root.querySelectorAll('#dataset').forEach(select => { select.closest('.data-mode')?.remove(); });
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) for (const [from, to] of replacements) if (node.nodeValue.includes(from)) node.nodeValue = node.nodeValue.replaceAll(from, to);
    root.querySelectorAll('.connection-mini').forEach(box => { box.innerHTML = '<strong><span class="dot green"></span>Browser storage active</strong><p>Your imported calls and manual entries are saved on this browser.</p>'; });
    root.querySelectorAll('.notice').forEach(node => { if (/Saving imports requires the full app/.test(node.textContent)) node.remove(); });
    const settingsForm = root.querySelector('#settings-form');
    if (settingsForm && !settingsForm.querySelector('input[name="durationMode"]')) {
      const mode = document.createElement('input');
      mode.type = 'hidden'; mode.name = 'durationMode'; mode.value = 'unverified';
      const field = document.createElement('input');
      field.type = 'hidden'; field.name = 'durationField'; field.value = 'duration';
      settingsForm.append(mode, field);
    }
  }
  const observer = new MutationObserver(() => clean());
  document.addEventListener('DOMContentLoaded', () => { observer.observe(document.body, { childList: true, subtree: true }); clean(); });
})();
