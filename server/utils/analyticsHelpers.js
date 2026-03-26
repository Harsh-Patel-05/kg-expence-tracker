/**
 * Bucket key for grouping by daily / weekly / monthly string dates
 */
function keyByRange(dateStr, mode) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  if (mode === "day") return d.toISOString().slice(0, 10);
  if (mode === "week") {
    const first = new Date(d);
    const day = (first.getDay() + 6) % 7;
    first.setDate(first.getDate() - day);
    first.setHours(0, 0, 0, 0);
    return first.toISOString().slice(0, 10);
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getBuckets(mode) {
  const now = new Date();
  const buckets = [];
  if (mode === "day") {
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      buckets.push({ key, label: key.slice(5) });
    }
  } else if (mode === "week") {
    for (let i = 7; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i * 7);
      const key = keyByRange(d.toISOString(), "week");
      buckets.push({ key, label: `W-${i}` });
    }
  } else {
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      buckets.push({ key, label: d.toLocaleString("en-IN", { month: "short" }) });
    }
  }
  return buckets;
}

module.exports = { keyByRange, getBuckets };
