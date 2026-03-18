# OpenClaw 真实环境测试用例

## 🏥 医院订阅功能测试指南

### 测试前准备

1. 确保 Repsclaw 插件已正确加载
2. 检查 OpenClaw 日志中是否有 `Repsclaw plugin registered successfully`
3. 首次启动时会显示欢迎消息

---

## 测试用例 1：首次使用欢迎提示

**目的**：验证新用户首次使用时显示欢迎消息

**步骤**：
1. 删除或重置订阅数据：删除 `~/.openclaw/repsclaw/hospital-subscriptions.json`
2. 重启 OpenClaw
3. 发送第一条消息触发欢迎提示

**预期结果**：
```
🏥 欢迎使用 Repsclaw 医疗插件！

为了给您提供更个性化的医疗服务，请先订阅您关注的医院。

您可以这样告诉我：
• "我想订阅北京协和医院"
• "帮我关注华山医院"
• "添加医院：复旦大学附属中山医院"
```

**重要说明**：
- 欢迎消息会在**用户发送第一条消息时**触发，而不是插件加载时
- 这是因为在 `register` 阶段没有活跃的用户会话

**调试检查**：
- 日志中应有 `HospitalSubscriptionService initialized` 且 `hospitalCount: 0`
- 日志中应有 `首次使用，将在会话开始时显示欢迎消息`
- 日志中应有 `欢迎消息 hook 已注册`
- 发送第一条消息后，日志中应有 `发送欢迎消息给用户` 或 `sendMessage 不可用，欢迎消息将在 AI 回复中显示`

---

## 测试用例 2：订阅第一家医院

**目的**：验证订阅功能正常工作

**用户输入**：
```
我想订阅北京协和医院
```

**预期 AI 行为**：
1. 调用 `subscribe_hospital` 工具
2. 参数：`{ "name": "北京协和医院", "isPrimary": false }`
3. 回复：`✅ 已订阅 北京协和医院（主要医院）`

**验证点**：
- 日志中有 `Subscribed to hospital {"name":"北京协和医院","isPrimary":true}`
- 文件 `~/.openclaw/repsclaw/hospital-subscriptions.json` 已创建且包含数据

---

## 测试用例 3：订阅多家医院

**前置条件**：已订阅北京协和医院

**用户输入**：
```
再帮我加上上海华山医院
```

**预期结果**：
- 成功订阅上海华山医院
- 回复：`✅ 已订阅 上海华山医院`
- 主要医院仍为北京协和医院

**验证点**：
- 日志中 `hospitalCount` 变为 2
- 订阅数据中两家医院，仅一家 `isPrimary: true`

---

## 测试用例 4：医院别名识别（关键功能）

**前置条件**：已订阅上海华山医院

**用户输入**：
```
把华山医院设成主要的
```

**预期 AI 行为**：
1. 调用 `set_primary_hospital` 工具
2. 参数：`{ "name": "华山医院" }`
3. 工具内部通过别名解析为 "上海华山医院"
4. 回复：`已将 上海华山医院（通过别名 "华山医院"）设为主要医院`

**调试检查**：
- 日志中应有 `resolveHospitalName` 调用记录
- 日志中显示 `resolved: "上海华山医院"`, `matchType: "alias"`

**如果失败**：
检查日志中的 `debug` 字段，查看 `availableHospitals` 列表

---

## 测试用例 5：重复订阅提示

**前置条件**：已订阅北京协和医院

**用户输入**：
```
订阅北京协和医院
```

**预期结果**：
- 回复：`您已订阅 北京协和医院，无需重复订阅`
- 数据中不会重复添加

**验证点**：
- 工具返回中有 `isExisting: true`

---

## 测试用例 6：查看订阅列表

**用户输入**：
```
查看我的医院
```

**预期结果**：
```
您订阅了 2 家医院：
🏥 北京协和医院
🏥 上海华山医院 (主要)
```

---

## 测试用例 7：取消订阅

**用户输入**：
```
取消订阅北京协和医院
```

**预期结果**：
- 成功取消订阅
- 主要医院自动转移到上海华山医院（如果北京协和是主要医院）

**验证点**：
- 日志中 `Unsubscribed from hospital`
- 订阅数据中只剩一家医院且 `isPrimary: true`

---

## 测试用例 8：取消不存在的医院

**用户输入**：
```
取消订阅广州中山医院
```

**预期结果**：
```
未找到 "广州中山医院" 的订阅。您当前订阅的医院有：上海华山医院
```

**调试信息**：
- 错误响应中包含 `debug.availableHospitals` 列表

---

## 测试用例 9：设置未订阅的医院为主要

**用户输入**：
```
设置广州中山医院为主要医院
```

**预期结果**：
```
您尚未订阅 "广州中山医院"。您当前订阅的医院有：上海华山医院
```

---

## 测试用例 10：复杂自然语言理解

**测试不同表达方式**：

| 输入 | 预期工具调用 | 预期结果 |
|------|------------|---------|
| "我要关注北京协和医院" | subscribe_hospital | 成功订阅 |
| "把华山医院设为默认" | set_primary_hospital | 成功设置 |
| "给我看看我都关注了哪些医院" | list_subscribed_hospitals | 显示列表 |
| "不再关注北京协和医院了" | unsubscribe_hospital | 成功取消 |

---

## 调试与故障排除

### 查看日志

OpenClaw 的日志输出到控制台，插件日志通过 `console.log` 输出。查看方式：

```bash
# 如果在终端运行 OpenClaw，直接查看输出
# 插件日志格式：[timestamp] [LEVEL] [REPSCLAW] message

# 查看 OpenClaw 命令日志（仅包含会话信息）
cat ~/.openclaw/logs/commands.log

# 实时查看 OpenClaw 输出（如果在终端运行）
openclaw 2>&1 | grep REPSCLAW

# 查看插件日志中的工具调用
openclaw 2>&1 | grep "Tool Call"

# 查看医院订阅相关日志
openclaw 2>&1 | grep -E "(REPSCLAW:HOSPITAL|REPSCLAW:TOOL|REPSCLAW:RESOLVER)"
```

### 检查订阅数据

```bash
cat ~/.openclaw/repsclaw/hospital-subscriptions.json
```

预期格式：
```json
{
  "hospitals": [
    {
      "name": "北京协和医院",
      "subscribedAt": "2024-03-17T10:30:00.000Z",
      "isPrimary": false
    },
    {
      "name": "上海华山医院",
      "subscribedAt": "2024-03-17T10:31:00.000Z",
      "isPrimary": true
    }
  ],
  "lastPromptedDate": "2024-03-17"
}
```

### HTTP API 测试

```bash
# 获取订阅列表
curl http://localhost:3000/api/repsclaw/hospitals

# 订阅医院
curl "http://localhost:3000/api/repsclaw/hospitals/subscribe?name=北京协和医院&isPrimary=true"

# 取消订阅
curl "http://localhost:3000/api/repsclaw/hospitals/unsubscribe?name=北京协和医院"
```

### 常见问题

**问题 1**：别名无法识别（如"华山医院"无法匹配"上海华山医院"）

**检查**：
1. 查看日志中 `resolveHospitalName` 的输入和输出
2. 检查 `findHospitalByAlias` 的匹配分数
3. 确认 `availableHospitals` 列表中包含完整医院名

**问题 2**：工具未注册

**检查**：
```bash
grep "订阅工具已注册" ~/.openclaw/logs/openclaw.log
```

应看到：
- `订阅工具已注册: subscribe_hospital`
- `订阅工具已注册: set_primary_hospital`

**问题 3**：首次使用不显示欢迎消息

**检查**：
1. 删除 `hospital-subscriptions.json` 文件
2. 重启 OpenClaw
3. 查看日志中 `isFirstTime: true`

---

## 测试清单

- [ ] 首次使用显示欢迎消息
- [ ] 订阅第一家医院（自动设为默认）
- [ ] 订阅第二家医院
- [ ] 使用别名设置主要医院（关键测试）
- [ ] 重复订阅提示
- [ ] 查看订阅列表
- [ ] 取消订阅
- [ ] 取消不存在的医院时显示可用列表
- [ ] 设置未订阅的医院时提示错误
- [ ] 长对话上下文保持（订阅-查看-设置-取消完整流程）

---

## 预期行为总结

| 场景 | 预期行为 |
|------|---------|
| 首次启动 | 显示欢迎消息，提示订阅医院 |
| 订阅 | 第一家自动设为默认，后续需要手动设置 |
| 别名识别 | "华山医院" → "上海华山医院" |
| 重复订阅 | 返回提示，不重复添加 |
| 取消主要医院 | 自动将剩余医院设为默认 |
| 错误处理 | 显示当前订阅列表供参考 |
