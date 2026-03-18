import { HospitalSubscriptionService } from './src/services/hospital-subscription.service';

const service = new HospitalSubscriptionService();

// 检查当前订阅状态
console.log('当前订阅状态:', service.getStats());
console.log('已订阅医院:', service.getHospitals().map(h => h.name));

// 尝试通过别名查找
const match = service.findHospitalByAlias('华山医院');
console.log('\n别名匹配结果:', match);

// 解析医院名称
const resolved = service.resolveHospitalName('华山医院');
console.log('名称解析结果:', resolved);

// 如果已存在，告知用户
if (resolved) {
  console.log(`\n✅ 您已经订阅了 ${resolved.name}`);
  if (resolved.isAlias) {
    console.log(`   ("华山医院" 是 "${resolved.name}" 的别名)`);
  }
} else {
  // 如果不存在，新增订阅
  console.log('\n开始订阅 华山医院...');
  const result = service.subscribe('华山医院', false);
  console.log(`✅ 已订阅: ${result.name}`);
}

console.log('\n最终订阅状态:', service.getStats());
console.log('已订阅医院列表:');
service.getHospitals().forEach((h, i) => {
  console.log(`  ${i + 1}. ${h.name} ${h.isPrimary ? '★' : ''}`);
});
