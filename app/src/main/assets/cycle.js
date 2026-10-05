/* Private local cycle estimates. Never referenced by a cloud projection. */
(function () {
  'use strict';
  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
    const parsed = parseDate(value);
    return parsed && isoDate(parsed) === value ? parsed : null;
  }
  function getCycleModel(today = new Date()) {
    const start = validDate(state.cycle.lastPeriod);
    if (!start) return null;
    const length = Math.min(45, Math.max(20, Number(state.cycle.cycleLength) || 28));
    const period = Math.min(10, Math.max(1, Number(state.cycle.periodLength) || 5));
    const dateDay = date => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    const elapsed = Math.floor((dateDay(today) - dateDay(start)) / 86400000);
    if (elapsed < 0) return null;
    const day = elapsed % length + 1;
    const ovulationDay = Math.max(1, length - 14);
    const labelForDay = d => d <= period ? 'Period estimate' : d === ovulationDay ? 'Estimated ovulation'
      : d >= ovulationDay - 5 && d <= ovulationDay + 1 ? 'Higher-fertility estimate' : 'Lower-fertility estimate';
    const cycleStart = addDays(start, Math.floor(elapsed / length) * length);
    return {ready: true, start, cycleStart, length, period, day, ovulationDay,
      nextPeriod: addDays(cycleStart, length), ovulation: addDays(cycleStart, ovulationDay - 1),
      label: labelForDay(day), labelForDay};
  }
  function openCycle() {
    cycleStart.value = state.cycle.lastPeriod || '';
    cycleStart.max = isoDate(new Date());
    cycleLength.value = state.cycle.cycleLength || 28;
    periodLength.value = state.cycle.periodLength || 5;
    cycleNote.value = state.cycle.note || '';
    cycleHome.checked = !!state.cycle.showHome;
    openM('cycleModal');
  }
  function saveCycle() {
    if (cycleStart.value && (!validDate(cycleStart.value) || cycleStart.value > isoDate(new Date()))) {
      return toast('Choose a valid period start date on or before today');
    }
    state.cycle = {lastPeriod: cycleStart.value, cycleLength: Math.min(45, Math.max(20, Number(cycleLength.value) || 28)),
      periodLength: Math.min(10, Math.max(1, Number(periodLength.value) || 5)), note: cycleNote.value.trim(), showHome: !!cycleHome.checked};
    save(); closeM('cycleModal'); render(); toast('Cycle settings saved on this phone 🔒');
  }
  function renderCycle() {
    const model = getCycleModel();
    cycleNoteView.textContent = state.cycle.note || 'No cycle note added.';
    if (!model) {
      cycleHeadline.textContent = 'Add a period start date';
      cycleSub.textContent = 'Estimates will appear here and stay on this phone.';
      cycleStats.innerHTML = ''; cycleDays.innerHTML = ''; return;
    }
    cycleHeadline.textContent = 'Cycle day ' + model.day;
    cycleSub.textContent = model.label + ' · dates are estimates';
    cycleStats.innerHTML = `<div class="mini"><div>Next period estimate</div><b>${esc(fmtDate(model.nextPeriod))}</b></div><div class="mini"><div>Ovulation estimate</div><b>${esc(fmtDate(model.ovulation))}</b></div>`;
    cycleDays.innerHTML = Array.from({length: model.length}, (_, i) => {
      const day = i + 1, label = model.labelForDay(day);
      const style = day <= model.period ? 'period' : day === model.ovulationDay ? 'ovulation'
        : day >= model.ovulationDay - 5 && day <= model.ovulationDay + 1 ? 'fertile' : 'lower';
      return `<div class="cyday ${style} ${day === model.day ? 'today' : ''}" title="${esc(label)}"><b>${day}</b><span>${esc(addDays(model.cycleStart, i).toLocaleDateString(undefined, {day: 'numeric', month: 'short'}))}</span></div>`;
    }).join('');
  }
  Object.assign(window, {getCycleModel, openCycle, saveCycle, renderCycle});
})();
