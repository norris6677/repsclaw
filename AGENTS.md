# RepsClaw Agent 使用指南

## 📝 工作要求

### 1. 测试范围要求

**除非我明确要求进行测试，否则在修改完API代码之后不需要进行完整的单元测试和集成测试。**

- ✅ 只对**修改的API**进行单元测试
- ❌ 不要运行完整的测试套件
- ❌ 不要运行集成测试
- ❌ 不要运行端到端测试

### 2. HTTP测试要求

**除非我明确要求进行真实HTTP测试，否则只进行mock测试。**

- ✅ 使用 mock 数据测试
- ✅ 使用 jest.mock() 或 nock 拦截HTTP请求
- ❌ 不要发起真实HTTP请求
- ❌ 不要运行 tests/integration/api/*.real.test.ts 文件

---

## 工具注册契约

### Clinical Trials 搜索工具

**工具名称**: `clinical_trials_search`

**功能**: 搜索 ClinicalTrials.gov 临床试验数据库

#### 触发条件

当用户输入包含以下关键词时，应调用此工具：
- "临床试验"、"clinical trial"
- "试验招募"、"正在招募"
- "试验阶段"、"phase trial"
- "试验地点"
- "NCT number"

#### 参数说明

```typescript
{
  condition: string;        // 疾病或医学状况（必填）
  status?: 'recruiting' | 'completed' | 'active' | 'not_recruiting' | 'all';  // 默认: recruiting
  phase?: Array<'EARLY_PHASE1' | 'PHASE1' | 'PHASE2' | 'PHASE3' | 'PHASE4'>;   // 试验阶段
  location?: string;        // 地点
  maxResults?: number;      // 最大结果数（1-100，默认: 10）
  filters?: {
    studyType?: 'INTERVENTIONAL' | 'OBSERVATIONAL' | 'EXPANDED_ACCESS';
    hasResults?: boolean;
    sponsor?: string;
  };
}
```

#### 使用示例

**场景 1**: 用户询问"有哪些肺癌临床试验正在招募？"
```json
{
  "tool": "clinical_trials_search",
  "parameters": {
    "condition": "肺癌",
    "status": "recruiting",
    "maxResults": 10
  }
}
```

**场景 2**: 用户询问"北京有什么糖尿病的二期试验？"
```json
{
  "tool": "clinical_trials_search",
  "parameters": {
    "condition": "糖尿病",
    "status": "recruiting",
    "phase": ["PHASE2"],
    "location": "北京",
    "maxResults": 5
  }
}
```

#### 输出格式

```json
{
  "status": "success",
  "data": {
    "results": [
      {
        "nctId": "NCT00000000",
        "title": "试验标题",
        "phase": "Phase II",
        "status": "recruiting",
        "location": "北京协和医院",
        "enrollment": 100,
        "conditions": ["肺癌"],
        "interventions": ["药物A"],
        "sponsor": "某某制药公司"
      }
    ],
    "totalCount": 25
  },
  "meta": {
    "timestamp": "2024-03-14T00:00:00.000Z",
    "tool": "clinical_trials_search"
  }
}
```

#### 错误处理

- **参数验证错误**: 返回 `status: 'error'` 和具体错误信息
- **API 调用失败**: 返回友好错误提示，建议用户稍后重试
- **无结果**: 返回空数组，建议用户调整搜索条件

#### 注意事项

1. **隐私保护**: 不要返回患者的个人识别信息
2. **免责声明**: 搜索结果仅供参考，不构成医疗建议
3. **时效性**: 试验状态可能随时变化，建议用户直接联系试验机构确认

## HTTP API 端点

### 健康检查

```
GET /api/repsclaw/health
```

返回插件状态和能力列表。

### 临床试验搜索

```
GET /api/repsclaw/health/trials?condition=肺癌&status=recruiting&maxResults=10
```

参数与工具调用一致。

## 部署说明

### 方案 A（Feishu 模式）

必须使用以下配置：

**package.json**:
```json
{
  "openclaw": {
    "extensions": ["./index.ts"]
  }
}
```

**openclaw.plugin.json**:
```json
{
  "id": "repsclaw",
  "name": "Repsclaw Healthcare Plugin",
  "configSchema": { ... }
  // 注意：不包含 "main" 字段
}
```

### 禁止事项

1. ❌ 不要使用软链接部署
2. ❌ 不要在 `openclaw.plugin.json` 中使用 `main` 字段
3. ❌ 不要精简 `node_modules` 依赖

详见 `DEPLOYMENT.md`
