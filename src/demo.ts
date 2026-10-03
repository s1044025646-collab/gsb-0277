import { Store } from './store';
import { renderReport } from './report';

const overlapInput = {
  name: 'demo-重叠与平局',
  universe: ['CHK-Alpha', 'CHK-Bravo', 'CHK-Charlie', 'CHK-Delta', 'CHK-Echo', 'CHK-Foxtrot'],
  candidates: [
    { id: 'PKG-01', cost: 8, elements: ['CHK-Alpha', 'CHK-Bravo', 'CHK-Charlie', 'CHK-Delta', 'CHK-Alpha'] },
    { id: 'PKG-02', cost: 4, elements: ['CHK-Alpha', 'CHK-Bravo'] },
    { id: 'PKG-03', cost: 4, elements: ['CHK-Charlie', 'CHK-Delta'] },
    { id: 'PKG-04', cost: 4, elements: ['CHK-Echo', 'CHK-Foxtrot'] },
    { id: 'PKG-05', cost: 9, elements: ['CHK-Echo', 'CHK-Foxtrot', 'CHK-Alpha'] },
  ],
};

const isolatedInput = {
  name: 'demo-孤立元素',
  universe: ['CHK-Alpha', 'CHK-Bravo', 'CHK-Orphan'],
  candidates: [
    { id: 'PKG-01', cost: 5, elements: ['CHK-Alpha'] },
    { id: 'PKG-02', cost: 5, elements: ['CHK-Bravo'] },
  ],
};

const greedyGapInput = {
  name: 'demo-贪心非最优',
  universe: ['E1', 'E2', 'E3', 'E4', 'E5', 'E6'],
  candidates: [
    { id: 'S1', cost: 3, elements: ['E1', 'E2', 'E4', 'E5'] },
    { id: 'S2', cost: 3, elements: ['E1', 'E2', 'E3'] },
    { id: 'S3', cost: 3, elements: ['E4', 'E5', 'E6'] },
  ],
};

export async function runDemo(store: Store): Promise<void> {
  console.log('=== 演示 1: 重叠、冗余、比值平局 ===');
  const i1 = store.importInput(overlapInput);
  console.log(`输入版本 #${i1.record.id} (新版本: ${i1.isNew}), 去重说明:`, JSON.stringify(i1.record.dedupNotes));
  const r1 = store.runGreedy(i1.record.id);
  console.log(renderReport(i1.record, r1));

  console.log('\n=== 演示 2: 孤立元素导致无法完整覆盖 ===');
  const i2 = store.importInput(isolatedInput);
  const r2 = store.runGreedy(i2.record.id);
  console.log(renderReport(i2.record, r2));

  console.log('\n=== 演示 3: 贪心成本高于穷举最优 ===');
  const i3 = store.importInput(greedyGapInput);
  const g3 = store.runGreedy(i3.record.id);
  const e3 = store.runExhaustive(i3.record.id);
  console.log(`贪心: 选中 ${(g3.payload as any).selectedIds.join(',')}, 成本 ${(g3.payload as any).totalCost}`);
  console.log(`穷举最优: 选中 ${(e3.payload as any).selectedIds.join(',')}, 成本 ${(e3.payload as any).totalCost}`);
  console.log('结论: 贪心给出可解释的可行解, 但本例成本高于穷举最优, 不能称为成本最低。');
}
