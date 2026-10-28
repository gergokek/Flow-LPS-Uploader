// Browser-only plan preview validation. Does not upload, approve or mutate data.
export function validatePlanPreview(obj, expectedBoard = '5105949528') {
  const tasks = obj?.tasks;
  const ids = Array.isArray(tasks) ? tasks.map(t => t?.itemId) : [];
  const validForecast = Array.isArray(tasks) && tasks.every(t =>
    typeof t?.itemId === 'string' &&
    /^\d+$/.test(t.itemId) &&
    (!t.forecast || (
      typeof t.forecast.from === 'string' &&
      typeof t.forecast.to === 'string' &&
      t.forecast.from <= t.forecast.to
    ))
  );
  if (
    obj?.schemaVersion !== 1 ||
    obj?.format !== 'flow-lps-plan-preview' ||
    obj?.status !== 'TEST_ONLY' ||
    obj?.isApprovedPlan !== false ||
    obj?.boardId !== expectedBoard ||
    !validForecast ||
    obj.taskCount !== ids.length ||
    new Set(ids).size !== ids.length ||
    !Array.isArray(obj.changes) ||
    obj.changeCount !== obj.changes.length
  ) {
    throw new Error('Nem megfelelő Flow LPS TEST_ONLY tervelőnézet.');
  }
  return { boardId: obj.boardId, taskCount: obj.taskCount, changeCount: obj.changeCount };
}
