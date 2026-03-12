import {
  IComplianceRule,
  IComplianceCheckResult,
  IComplianceReport,
  IViolation,
  SeverityLevel,
} from '../types';

/**
 * 合规检查服务
 * 提供内容合规性验证和报告生成
 */
export class ComplianceService {
  private rules: Map<string, IComplianceRule> = new Map();

  /**
   * 注册合规规则
   */
  registerRule(rule: IComplianceRule): void {
    this.rules.set(rule.id, rule);
  }

  /**
   * 注销合规规则
   */
  unregisterRule(ruleId: string): boolean {
    return this.rules.delete(ruleId);
  }

  /**
   * 获取所有规则
   */
  getAllRules(): IComplianceRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * 按分类获取规则
   */
  getRulesByCategory(category: string): IComplianceRule[] {
    return this.getAllRules().filter((rule) => rule.category === category);
  }

  /**
   * 执行单个规则检查
   */
  async checkRule(
    ruleId: string,
    content: string
  ): Promise<IComplianceCheckResult> {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new Error(`Rule not found: ${ruleId}`);
    }
    return rule.checkFunction(content);
  }

  /**
   * 执行完整合规检查
   */
  async checkCompliance(
    documentId: string,
    content: string,
    ruleIds?: string[]
  ): Promise<IComplianceReport> {
    const rulesToCheck = ruleIds
      ? ruleIds.map((id) => this.rules.get(id)).filter(Boolean) as IComplianceRule[]
      : this.getAllRules();

    const results: IComplianceCheckResult[] = [];
    const violationsBySeverity: Record<SeverityLevel, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };

    for (const rule of rulesToCheck) {
      const result = await rule.checkFunction(content);
      results.push(result);

      // 统计违规
      for (const violation of result.violations) {
        violationsBySeverity[violation.severity]++;
      }
    }

    const failedCount = results.filter((r) => !r.passed).length;

    return {
      documentId,
      timestamp: new Date(),
      overallStatus: failedCount === 0 ? 'passed' : 'failed',
      results,
      summary: {
        total: results.length,
        passed: results.length - failedCount,
        failed: failedCount,
        violationsBySeverity,
      },
    };
  }

  /**
   * 预定义规则：敏感词检测
   */
  static createSensitiveWordRule(
    id: string,
    name: string,
    words: string[],
    severity: SeverityLevel = 'high'
  ): IComplianceRule {
    return {
      id,
      name,
      description: `检测敏感词: ${words.join(', ')}`,
      category: 'privacy',
      severity,
      checkFunction: async (content: string): Promise<IComplianceCheckResult> => {
        const violations: IViolation[] = [];

        for (const word of words) {
          const regex = new RegExp(word, 'gi');
          let match;
          while ((match = regex.exec(content)) !== null) {
            violations.push({
              message: `发现敏感词: "${word}"`,
              location: { start: match.index, end: match.index + word.length },
              severity,
            });
          }
        }

        return {
          passed: violations.length === 0,
          ruleId: id,
          violations,
          suggestions:
            violations.length > 0 ? ['请检查并移除敏感内容'] : undefined,
        };
      },
    };
  }

  /**
   * 预定义规则：长度检查
   */
  static createLengthRule(
    id: string,
    name: string,
    minLength?: number,
    maxLength?: number
  ): IComplianceRule {
    return {
      id,
      name,
      description: `内容长度检查 (min: ${minLength}, max: ${maxLength})`,
      category: 'custom',
      severity: 'medium',
      checkFunction: async (content: string): Promise<IComplianceCheckResult> => {
        const violations: IViolation[] = [];

        if (minLength !== undefined && content.length < minLength) {
          violations.push({
            message: `内容太短，最少需要 ${minLength} 个字符`,
            severity: 'medium',
          });
        }

        if (maxLength !== undefined && content.length > maxLength) {
          violations.push({
            message: `内容太长，最多允许 ${maxLength} 个字符`,
            severity: 'medium',
          });
        }

        return {
          passed: violations.length === 0,
          ruleId: id,
          violations,
        };
      },
    };
  }
}
