const CYCLE_LENGTH = 28;
const PILL_DAYS = 21;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function toDateOnly(dateInput) {
  const date = new Date(dateInput);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function toYmd(dateInput = new Date()) {
  const date = toDateOnly(dateInput);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function calcCycleStatus(cycleStartDate, currentDate = new Date()) {
  const start = toDateOnly(cycleStartDate);
  const current = toDateOnly(currentDate);
  const diffDays = Math.floor((current.getTime() - start.getTime()) / ONE_DAY_MS);
  const hasStarted = diffDays >= 0;

  if (!hasStarted) {
    const daysUntilStart = Math.abs(diffDays);
    return {
      hasStarted: false,
      daysUntilStart,
      dayIndex: 0,
      isPillDay: true,
      breakDayIndex: 0,
      phaseText: `距离开始还有${daysUntilStart}天`
    };
  }

  const dayIndex = ((diffDays % CYCLE_LENGTH) + CYCLE_LENGTH) % CYCLE_LENGTH + 1;
  const isPillDay = dayIndex <= PILL_DAYS;
  const breakDayIndex = isPillDay ? 0 : dayIndex - PILL_DAYS;
  const phaseText = isPillDay
    ? `第${dayIndex}天（吃药）`
    : `第${dayIndex}天（停药第${breakDayIndex}天）`;

  return {
    hasStarted: true,
    daysUntilStart: 0,
    dayIndex,
    isPillDay,
    breakDayIndex,
    phaseText
  };
}

module.exports = {
  CYCLE_LENGTH,
  PILL_DAYS,
  toYmd,
  calcCycleStatus
};
