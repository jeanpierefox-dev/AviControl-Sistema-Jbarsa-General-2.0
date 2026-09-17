const fs = require('fs');
let content = fs.readFileSync('components/pages/Reports.tsx', 'utf-8');

content = content.replace("import { getBatchName } from './Collections';", "");

content = content.replace(
  "const { user } = React.useContext(AuthContext);",
  `const { user } = React.useContext(AuthContext);
  const [batches, setBatches] = useState<Batch[]>([]);
  
  useEffect(() => {
    setBatches(getBatches());
  }, []);

  const getBatchName = (batchId: string) => {
    if (batchId === 'direct-sales') return 'Ventas Directas';
    const b = batches.find(b => b.id === batchId);
    return b ? b.name : batchId;
  };`
);

fs.writeFileSync('components/pages/Reports.tsx', content);
console.log('Fixed getBatchName in Reports.tsx');
