import { HospitalSubscriptionService } from './src/services/hospital-subscription.service';

const service = new HospitalSubscriptionService();

// 列出当前订阅
console.log('当前订阅状态:', service.getStats());
console.log('已订阅医院:', service.getHospitals());

// 订阅示例医院
const hospitalsToSubscribe = [
  '北京协和医院',
  '上海华山医院', 
  '广州中山医院'
];

console.log('\n开始订阅...');
for (const hospital of hospitalsToSubscribe) {
  const result = service.subscribe(hospital, false);
  console.log(`✅ 已订阅: ${result.name} ${result.isPrimary ? '(主要)' : ''}`);
}

// 设置主要医院
service.setPrimary('北京协和医院');

console.log('\n订阅完成！');
console.log('最终订阅状态:', service.getStats());
console.log('已订阅医院列表:');
service.getHospitals().forEach((h, i) => {
  console.log(`  ${i + 1}. ${h.name} ${h.isPrimary ? '★' : ''}`);
});
