import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePlanPreview } from '../plan-validator.js';

const valid = () => ({
  schemaVersion: 1,
  format: 'flow-lps-plan-preview',
  status: 'TEST_ONLY',
  isApprovedPlan: false,
  boardId: '5105949528',
  taskCount: 1,
  changeCount: 0,
  tasks: [{ itemId: '123', forecast: { from: '2026-10-28', to: '2026-10-29' } }],
  changes: []
});
test('accepts matching local TEST_ONLY plan', () => {
  assert.deepEqual(validatePlanPreview(valid()), { boardId: '5105949528', taskCount: 1, changeCount: 0 });
});
for (const [name, mutate] of [
  ['approved plan', p => { p.isApprovedPlan = true; }],
  ['wrong board', p => { p.boardId = 'other'; }],
  ['non-test status', p => { p.status = 'APPROVED'; }],
  ['duplicate task IDs', p => { p.tasks.push({ itemId: '123' }); p.taskCount = 2; }],
  ['non-numeric task ID', p => { p.tasks[0].itemId = 'abc'; }],
  ['reversed forecast dates', p => { p.tasks[0].forecast.from = '2026-11-02'; }],
  ['incorrect task count', p => { p.taskCount = 2; }],
  ['incorrect change count', p => { p.changeCount = 1; }],
  ['missing tasks', p => { delete p.tasks; p.taskCount = 0; }]
]) {
  test('rejects ' + name, () => {
    const p = valid(); mutate(p);
    assert.throws(() => validatePlanPreview(p), /TEST_ONLY/);
  });
}
