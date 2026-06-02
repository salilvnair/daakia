/** Pure function that groups history items by date/time */

interface HistoryItem {
  id: number;
  method: string;
  url: string;
  status: number;
  status_text?: string;
  response_time?: number;
  response_size?: number;
  request_data?: string;
  response_data?: string;
  created_at?: string;
}

export interface SubGroup {
  label: string;
  items: HistoryItem[];
}

export interface TopGroup {
  label: string;
  subGroups: SubGroup[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isYesterday(d: Date, now: Date): boolean {
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  return isSameDay(d, y);
}

export function formatFullTimestamp(d: Date): string {
  const month = MONTHS[d.getMonth()];
  const day = d.getDate();
  const year = d.getFullYear();
  let hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const seconds = d.getSeconds().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${month} ${day}, ${year}, ${hours}:${minutes}:${seconds} ${ampm}`;
}

export function buildGroups(items: HistoryItem[]): TopGroup[] {
  const now = new Date();
  const result: TopGroup[] = [];

  const todayItems: HistoryItem[] = [];
  const yesterdayItems: HistoryItem[] = [];
  const sameDateMap = new Map<string, HistoryItem[]>();
  const yearMap = new Map<number, Map<string, HistoryItem[]>>();

  for (const item of items) {
    const d = item.created_at ? new Date(item.created_at) : now;

    if (isSameDay(d, now)) {
      todayItems.push(item);
    } else if (isYesterday(d, now)) {
      yesterdayItems.push(item);
    } else if (d.getFullYear() === now.getFullYear()) {
      const key = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
      if (!sameDateMap.has(key)) sameDateMap.set(key, []);
      sameDateMap.get(key)!.push(item);
    } else {
      const year = d.getFullYear();
      if (!yearMap.has(year)) yearMap.set(year, new Map());
      const dateKey = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
      const yMap = yearMap.get(year)!;
      if (!yMap.has(dateKey)) yMap.set(dateKey, []);
      yMap.get(dateKey)!.push(item);
    }
  }

  // Today — sub-grouped by hour intervals
  if (todayItems.length > 0) {
    const hourBuckets = new Map<string, HistoryItem[]>();
    for (const item of todayItems) {
      const d = item.created_at ? new Date(item.created_at) : now;
      const diffMs = now.getTime() - d.getTime();
      const diffHrs = Math.floor(diffMs / 3600000);
      let label: string;
      if (diffMs < 3600000) {
        label = 'Just now';
      } else {
        label = `${diffHrs} hour${diffHrs > 1 ? 's' : ''} ago`;
      }
      if (!hourBuckets.has(label)) hourBuckets.set(label, []);
      hourBuckets.get(label)!.push(item);
    }
    const subGroups = Array.from(hourBuckets.entries()).map(([label, items]) => ({ label, items }));
    result.push({ label: 'Today', subGroups });
  }

  // Yesterday
  if (yesterdayItems.length > 0) {
    result.push({ label: 'Yesterday', subGroups: [{ label: '', items: yesterdayItems }] });
  }

  // Same year older dates
  for (const [dateLabel, dateItems] of sameDateMap) {
    result.push({ label: dateLabel, subGroups: [{ label: '', items: dateItems }] });
  }

  // Previous years
  const sortedYears = Array.from(yearMap.keys()).sort((a, b) => b - a);
  for (const year of sortedYears) {
    const yMap = yearMap.get(year)!;
    const subGroups = Array.from(yMap.entries()).map(([dateLabel, items]) => ({ label: dateLabel, items }));
    result.push({ label: String(year), subGroups });
  }

  return result;
}
