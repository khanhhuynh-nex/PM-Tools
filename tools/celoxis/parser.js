const fs = require('fs');

function parseTimesheet(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');

    // Find all day headers and their positions
    const dayPattern = /#+\s*[#\s]*(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d+)(?:\s+[A-Za-z]+)?(?:\s+\d{4})?\s*:?/gi;
    const dayMatches = [];
    let m;
    while ((m = dayPattern.exec(content)) !== null) {
        dayMatches.push({ dayName: m[1], dayNum: m[2], index: m.index, end: m.index + m[0].length });
    }

    const parsed = {};

    for (let i = 0; i < dayMatches.length; i++) {
        const { dayName, dayNum, end } = dayMatches[i];
        const nextIndex = i + 1 < dayMatches.length ? dayMatches[i + 1].index : content.length;
        const dayContent = content.slice(end, nextIndex);
        const dayStr = `${capitalize(dayName)} ${dayNum}`;
        parsed[dayStr] = [];

        // Find all work items within this day block
        const itemPattern = /^\s*\*(.*?)-\s*\(\s*([\d.]+)(%|h)\s*\)/gm;
        const itemMatches = [];
        let im;
        while ((im = itemPattern.exec(dayContent)) !== null) {
            itemMatches.push({
                workItem: im[1].trim(),
                value: im[2],
                unit: im[3],
                index: im.index,
                end: im.index + im[0].length,
            });
        }

        for (let j = 0; j < itemMatches.length; j++) {
            const item = itemMatches[j];
            const nextItemIndex = j + 1 < itemMatches.length ? itemMatches[j + 1].index : dayContent.length;
            const tasksRaw = dayContent.slice(item.end, nextItemIndex);

            const hours = item.unit === '%'
                ? Math.round(parseFloat(item.value) / 100 * 8 * 100) / 100
                : parseFloat(item.value);

            const tasks = tasksRaw
                .split('\n')
                .map(line => line.replace(/^[\s\u2022\-*]+/, '').trim())
                .filter(Boolean);

            parsed[dayStr].push({
                workItem: item.workItem,
                hours,
                tasks: tasks.join('; '),
            });
        }
    }

    return parsed;
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

module.exports = { parseTimesheet };
