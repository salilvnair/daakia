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
  subGroups?: SubGroup[]; // 3-level: year → month → date → items
}

export interface TopGroup {
  label: string;
  subGroups: SubGroup[];
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isYesterday(d: Date, now: Date): boolean {
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  return isSameDay(d, y);
}

export function formatFullTimestamp(d: Date): string {
  const month = MONTHS_SHORT[d.getMonth()];
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
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const todayItems: HistoryItem[] = [];
  const yesterdayItems: HistoryItem[] = [];

  // For same year, non-current-month dates: Map<monthIndex, Map<dateKey, items>>
  const sameYearMonthMap = new Map<number, Map<string, HistoryItem[]>>();

  // For past years: Map<year, Map<monthIndex, Map<dateKey, items>>>
  const pastYearMap = new Map<number, Map<number, Map<string, HistoryItem[]>>>();

  for (const item of items) {
    const d = item.created_at ? new Date(item.created_at) : now;

    if (isSameDay(d, now)) {
      todayItems.push(item);
    } else if (isYesterday(d, now)) {
      yesterdayItems.push(item);
    } else if (d.getFullYear() === currentYear) {
      const monthIdx = d.getMonth();
      const dateKey = `${MONTHS_SHORT[monthIdx]} ${d.getDate()}`;

      if (monthIdx === currentMonth) {
        // Same month (current month past dates): keep as flat top-level "Jun 1", "Jun 2"
        if (!sameYearMonthMap.has(monthIdx)) sameYearMonthMap.set(monthIdx, new Map());
        sameYearMonthMap.get(monthIdx)!.set(dateKey, sameYearMonthMap.get(monthIdx)!.get(dateKey) || []);
        sameYearMonthMap.get(monthIdx)!.get(dateKey)!.push(item);
      } else {
        // Past month in current year: "May" → "May 31", "May 30" → items
        if (!sameYearMonthMap.has(monthIdx)) sameYearMonthMap.set(monthIdx, new Map());
        const mm = sameYearMonthMap.get(monthIdx)!;
        if (!mm.has(dateKey)) mm.set(dateKey, []);
        mm.get(dateKey)!.push(item);
      }
    } else {
      const year = d.getFullYear();
      const monthIdx = d.getMonth();
      const dateKey = `${MONTHS_SHORT[monthIdx]} ${d.getDate()}`;
      if (!pastYearMap.has(year)) pastYearMap.set(year, new Map());
      const ym = pastYearMap.get(year)!;
      if (!ym.has(monthIdx)) ym.set(monthIdx, new Map());
      const dm = ym.get(monthIdx)!;
      if (!dm.has(dateKey)) dm.set(dateKey, []);
      dm.get(dateKey)!.push(item);
    }
  }

  // Today — sub-grouped by hour intervals (unchanged)
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

  // Yesterday (unchanged)
  if (yesterdayItems.length > 0) {
    result.push({ label: 'Yesterday', subGroups: [{ label: '', items: yesterdayItems }] });
  }

  // Same year — sorted by month descending
  const sortedMonths = Array.from(sameYearMonthMap.keys()).sort((a, b) => b - a);
  for (const monthIdx of sortedMonths) {
    const dateMap = sameYearMonthMap.get(monthIdx)!;
    const monthName = MONTHS[monthIdx];

    if (monthIdx === currentMonth) {
      // Current month → flat top-level "Jun 2", "Jun 1" (no month grouping)
      const sortedDates = Array.from(dateMap.entries()).sort(([a], [b]) => {
        const da = parseInt(a.split(' ')[1]);
        const db = parseInt(b.split(' ')[1]);
        return db - da;
      });
      for (const [dateLabel, dateItems] of sortedDates) {
        result.push({ label: dateLabel, subGroups: [{ label: '', items: dateItems }] });
      }
    } else {
      // Past month → top-level "May" → sub-groups "May 31", "May 30" → items
      const dateSubGroups: SubGroup[] = [];
      const sortedDates = Array.from(dateMap.entries()).sort(([a], [b]) => {
        const da = parseInt(a.split(' ')[1]);
        const db = parseInt(b.split(' ')[1]);
        return db - da;
      });
      for (const [dateLabel, dateItems] of sortedDates) {
        dateSubGroups.push({ label: dateLabel, items: dateItems });
      }
      result.push({ label: monthName, subGroups: dateSubGroups });
    }
  }

  // Previous years — 3-level: year → month → date → items
  const sortedYears = Array.from(pastYearMap.keys()).sort((a, b) => b - a);
  for (const year of sortedYears) {
    const yearMonthMap = pastYearMap.get(year)!;
    const sortedPastMonths = Array.from(yearMonthMap.keys()).sort((a, b) => b - a);
    const yearSubGroups: SubGroup[] = [];

    for (const monthIdx of sortedPastMonths) {
      const dateMap = yearMonthMap.get(monthIdx)!;
      const monthName = MONTHS[monthIdx];
      const dateSubGroups: SubGroup[] = [];

      const sortedDates = Array.from(dateMap.entries()).sort(([a], [b]) => {
        const da = parseInt(a.split(' ')[1]);
        const db = parseInt(b.split(' ')[1]);
        return db - da;
      });
      for (const [dateLabel, dateItems] of sortedDates) {
        dateSubGroups.push({ label: dateLabel, items: dateItems });
      }

      yearSubGroups.push({ label: monthName, items: [], subGroups: dateSubGroups });
    }

    result.push({ label: String(year), subGroups: yearSubGroups });
  }

  return result;
}
