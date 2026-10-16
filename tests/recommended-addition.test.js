/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { parseRecommendedAddition, SOURCE_RESTRAINT_CONTRACT, RECOMMENDED_ADDITION_CONTRACT } = require('../lib/recommended-addition.ts');
const { assessEditorSummary } = require('../lib/editor-summary.ts');
const findings = '• The survey invitation is clear.\n• The opening establishes the topic.\n• The closing requests participation.';
test('extracts the conditional paragraph without consuming summary findings', () => {
  for (const label of ['**Recommended Addition** —', 'Recommended Addition:']) {
    const summary = `${label} Explain who considers feedback. The source does not establish this.\n\n${findings}`;
    assert.deepEqual(parseRecommendedAddition(summary), { addition: 'Explain who considers feedback. The source does not establish this.', findings });
    assert.deepEqual(assessEditorSummary(summary).violations, []);
  }
});
test('supports wrapped paragraphs and adjacent findings', () => {
  assert.deepEqual(parseRecommendedAddition(`**Recommended Addition** — Supply verified details.\nExplain their intended use.\n${findings}`), { addition: 'Supply verified details.\nExplain their intended use.', findings });
});
test('legacy summaries, incidental mentions and empty labels do not activate marker', () => {
  for (const summary of ['', findings, 'A Recommended Addition could help.', '**Recommended Addition** — ']) {
    assert.deepEqual(parseRecommendedAddition(summary), { addition: null, findings: summary });
  }
});
test('source boundary covers all rewrite requests without changing cadence or graviton definitions', () => {
  const route = fs.readFileSync('app/api/mr/route.ts', 'utf8');
  assert.match(route, /heresyMode \? "" : SOURCE_RESTRAINT_CONTRACT/);
  assert.match(route, /\$\{RECOMMENDED_ADDITION_CONTRACT\}/);
  assert.match(SOURCE_RESTRAINT_CONTRACT, /claims, commitments, benefits or evidence/);
  assert.match(SOURCE_RESTRAINT_CONTRACT, /initial, repaired and alternate/);
  assert.match(RECOMMENDED_ADDITION_CONTRACT, /ALL three conditions/);
  assert.match(RECOMMENDED_ADDITION_CONTRACT, /Omit the paragraph entirely/);
});
test('marker remains outside unchanged qualitative bar and has visible and accessible explanation', () => {
  const ui = fs.readFileSync('components/GravitasApp.tsx', 'utf8');
  assert.match(ui, /const holdWidth = `\$\{100 - tensionWidth\}%`/);
  assert.match(ui, /hasRecommendedAddition=\{Boolean\(recommendedAddition\)\}/);
  assert.match(ui, /aria-label="Recommended Addition:/);
  assert.match(
    ui,
    /Separate from Reader\s+Hold; see the Editor’s Summary below/
  );
  assert.ok(ui.indexOf('<aside aria-label="Recommended Addition"') < ui.indexOf('renderMR(summaryFindings)'));
});
test('rendered marker is conditional and leaves bar width unchanged', () => {
  const ts = require('typescript');
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const ui = fs.readFileSync('components/GravitasApp.tsx', 'utf8');
  const component = ui.slice(ui.indexOf('function ReaderResponsePanel('), ui.indexOf('function SettingsMarker('));
  const js = ts.transpileModule(component, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020 } }).outputText;
  const Panel = new Function('React', 'READER_RESPONSE_VALUES', `${js}; return ReaderResponsePanel;`)(React, { high: 4, low: 1 });
  const response = { signals: { Strong: 'high', Engaged: 'high', Uneven: 'low', Vulnerable: 'low', 'At risk': 'low' }, verdict: 'Clear invitation.' };
  const normal = renderToStaticMarkup(React.createElement(Panel, { response }));
  const flagged = renderToStaticMarkup(React.createElement(Panel, { response, hasRecommendedAddition: true }));
  assert.doesNotMatch(normal, /Recommended Addition|bg-red-400/);
  assert.match(flagged, /aria-label="Recommended Addition: additional source information is needed/);
  assert.match(flagged, /Separate from Reader Hold/);
  assert.equal(normal.match(/style="width:[^"]+"/)[0], flagged.match(/style="width:[^"]+"/)[0]);
});
test('empty labels cannot swallow subsequent findings; placeholders never activate marker', () => {
  for (const value of ['**Recommended Addition** —\n\n' + findings, '**Recommended Addition** — None.', '**Recommended Addition** — Not applicable']) {
    assert.deepEqual(parseRecommendedAddition(value), { addition: null, findings: value });
  }
});
test('indented and numbered findings remain outside the diagnostic', () => {
  for (const finding of ['  • Keep this finding.', '1. Keep this finding.', '**Other finding**']) {
    const parsed = parseRecommendedAddition('**Recommended Addition** — Supply verified information.\r\n' + finding);
    assert.equal(parsed.addition, 'Supply verified information.');
    assert.equal(parsed.findings, finding.trim());
  }
});
