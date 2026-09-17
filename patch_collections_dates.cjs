const fs = require('fs');
let content = fs.readFileSync('components/pages/Collections.tsx', 'utf-8');

const getSafeDateStringSrc = `
const getSafeDateString = (dateVal: string | undefined | null, fallbackId: string) => {
    if (dateVal) {
        const d = new Date(dateVal);
        if (!isNaN(d.getTime())) return d.toLocaleDateString();
    }
    const idNum = parseInt(fallbackId);
    if (!isNaN(idNum)) {
        const d = new Date(idNum);
        if (!isNaN(d.getTime())) return d.toLocaleDateString();
    }
    return new Date().toLocaleDateString();
};

const getSafeDateObj = (dateVal: string | undefined | null, fallbackId: string) => {
    if (dateVal) {
        const d = new Date(dateVal);
        if (!isNaN(d.getTime())) return d;
    }
    const idNum = parseInt(fallbackId);
    if (!isNaN(idNum)) {
        const d = new Date(idNum);
        if (!isNaN(d.getTime())) return d;
    }
    return new Date();
};
`;

content = content.replace('const Collections: React.FC = () => {', getSafeDateStringSrc + '\\nconst Collections: React.FC = () => {');

// Replace standard ones
content = content.replace(/order\.date \? new Date\(order\.date\)\.toLocaleDateString\(\) : new Date\(parseInt\(order\.id\)\)\.toLocaleDateString\(\)/g, "getSafeDateString(order.date, order.id)");
content = content.replace(/viewHistoryOrder\.date \? new Date\(viewHistoryOrder\.date\)\.toLocaleDateString\(\) : new Date\(parseInt\(viewHistoryOrder\.id\)\)\.toLocaleDateString\(\)/g, "getSafeDateString(viewHistoryOrder.date, viewHistoryOrder.id)");
content = content.replace(/order\.date \? new Date\(order\.date\) : new Date\(parseInt\(order\.id\)\)/g, "getSafeDateObj(order.date, order.id)");
content = content.replace(/new Date\(pay\.timestamp\)\.toLocaleDateString\(\)/g, "getSafeDateString(pay.timestamp, '0')");

fs.writeFileSync('components/pages/Collections.tsx', content);
console.log('Patched Collections.tsx dates');
