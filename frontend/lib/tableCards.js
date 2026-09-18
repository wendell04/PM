/**
 * Labels for the phone card layout, read from the table's own headers.
 *
 * admin-dashboard.css turns a `table.pmp-rt` into cards below 700px, and each cell shows the
 * header it sat under as its label - but only if the cell carries `data-label`. Writing that by
 * hand on 150 cells across 20 tables is where drift starts: a header gets renamed and the label
 * under it does not. So the label is taken from the <th> at render time instead; it cannot
 * disagree with the column because it IS the column.
 *
 * Rules, applied only where the markup has not already said otherwise:
 *  - the first column with a non-empty header is the card's title (`head`)
 *  - a column with an empty header is a checkbox or a disclosure arrow (`chev`), or, if it holds
 *    neither, decoration a card does not need (`hide`)
 *  - a header reading "Action" or "Actions" is the row's buttons (`actions`)
 *  - a cell spanning (nearly) every column is a loading, empty or detail row (`full`)
 *
 * Runs again after every DOM change under `root`, because React replaces cells on re-render.
 */
export function stampTableLabels(root) {
  if (!root) return;
  root.querySelectorAll('table.pmp-rt').forEach(stampOne);
}

function stampOne(table) {
  const headRow = table.tHead?.rows?.[0];
  if (!headRow) return;
  const headers = Array.from(headRow.cells).map(th => (th.innerText || th.textContent || '').trim());
  const cols = headers.length;
  if (!cols) return;

  let titleCol = headers.findIndex(h => h !== '');
  if (titleCol < 0) titleCol = 0;

  for (const tbody of table.tBodies) {
    // Only this table's rows: a nested table inside a cell keeps its own headers and stays a table.
    for (const tr of Array.from(tbody.children)) {
      if (tr.tagName !== 'TR') continue;
      let col = 0;
      for (const td of Array.from(tr.children)) {
        if (td.tagName !== 'TD' && td.tagName !== 'TH') continue;
        const span = td.colSpan || 1;
        const manual = td.dataset.rt || td.dataset.label != null;
        if (!manual) {
          if (span >= Math.max(2, cols - 1)) {
            td.dataset.rt = 'full';
          } else if (col === titleCol) {
            td.dataset.rt = 'head';
          } else {
            const h = headers[col] ?? '';
            if (h === '') {
              td.dataset.rt = td.querySelector('input,button,svg') ? 'chev' : 'hide';
            } else if (/^actions?$/i.test(h)) {
              td.dataset.rt = 'actions';
            } else {
              td.dataset.label = h;
            }
          }
        }
        col += span;
      }
    }
  }
}

/** Keep the labels current for the life of an element. Returns the disconnect function. */
export function watchTableLabels(root) {
  if (!root || typeof MutationObserver === 'undefined') return () => {};
  let queued = false;
  const run = () => { queued = false; stampTableLabels(root); };
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(run);
  });
  observer.observe(root, { childList: true, subtree: true });
  run();
  return () => observer.disconnect();
}
