/**
 * 查询API CLI命令
 * 封装所有医疗数据查询工具
 */

import { getServices } from '../services/service-container';
import { parseArgs } from '../utils/arg-parser';
import { printSuccess, printError, printHelp } from '../utils/output';

const services = getServices();

// FDA查询
async function fda(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);

  if (parsed.help || parsed.h) {
    printHelp(
      'repsclaw query fda',
      '查询FDA药品信息',
      'repsclaw query fda --drug=<药品名> [--limit=10]',
      [
        'repsclaw query fda --drug="Aspirin"',
        'repsclaw query fda --drug="Ibuprofen" --limit=5',
      ]
    );
    return;
  }

  if (!parsed.drug) {
    printError('MISSING_PARAM', '请提供 --drug 参数');
    return;
  }

  try {
    const result = await services.healthAPI.fda.searchDrug(parsed.drug as string, {
      limit: parsed.limit ? parseInt(parsed.limit as string, 10) : 10,
    });
    printSuccess(result);
  } catch (error) {
    printError('FDA_ERROR', error instanceof Error ? error.message : String(error));
  }
}

// PubMed查询
async function pubmed(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);

  if (parsed.help || parsed.h) {
    printHelp(
      'repsclaw query pubmed',
      '查询PubMed医学文献',
      'repsclaw query pubmed --term=<搜索词> [--limit=10]',
      [
        'repsclaw query pubmed --term="diabetes treatment"',
        'repsclaw query pubmed --term="COVID-19 vaccine" --limit=20',
      ]
    );
    return;
  }

  if (!parsed.term) {
    printError('MISSING_PARAM', '请提供 --term 参数');
    return;
  }

  try {
    const result = await services.healthAPI.pubmed.search(parsed.term as string, {
      maxResults: parsed.limit ? parseInt(parsed.limit as string, 10) : 10,
    });
    printSuccess(result);
  } catch (error) {
    printError('PUBMED_ERROR', error instanceof Error ? error.message : String(error));
  }
}

// ICD-10查询
async function icd10(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);

  if (parsed.help || parsed.h) {
    printHelp(
      'repsclaw query icd10',
      '查询ICD-10疾病编码',
      'repsclaw query icd10 --code=<编码> 或 --term=<关键词>',
      [
        'repsclaw query icd10 --code="E11"',
        'repsclaw query icd10 --term="diabetes mellitus"',
      ]
    );
    return;
  }

  try {
    let result;
    if (parsed.code) {
      result = await services.healthAPI.icd10.searchByCode(parsed.code as string);
    } else if (parsed.term) {
      result = await services.healthAPI.icd10.searchByTerm(parsed.term as string);
    } else {
      printError('MISSING_PARAM', '请提供 --code 或 --term 参数');
      return;
    }
    printSuccess(result);
  } catch (error) {
    printError('ICD10_ERROR', error instanceof Error ? error.message : String(error));
  }
}

// Clinical Trials查询
async function clinicalTrials(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);

  if (parsed.help || parsed.h) {
    printHelp(
      'repsclaw query clinical-trials',
      '查询ClinicalTrials.gov临床试验',
      'repsclaw query clinical-trials --condition=<疾病> [--status=recruiting]',
      [
        'repsclaw query clinical-trials --condition="lung cancer"',
        'repsclaw query clinical-trials --condition="diabetes" --status=recruiting',
      ]
    );
    return;
  }

  if (!parsed.condition) {
    printError('MISSING_PARAM', '请提供 --condition 参数');
    return;
  }

  try {
    const result = await services.healthAPI.clinicalTrials.search({
      condition: parsed.condition as string,
      status: parsed.status as string | undefined,
      limit: parsed.limit ? parseInt(parsed.limit as string, 10) : 10,
    });
    printSuccess(result);
  } catch (error) {
    printError('CLINICAL_TRIALS_ERROR', error instanceof Error ? error.message : String(error));
  }
}

// medRxiv查询
async function medrxiv(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);

  if (parsed.help || parsed.h) {
    printHelp(
      'repsclaw query medrxiv',
      '查询medRxiv预印本论文',
      'repsclaw query medrxiv --term=<搜索词> [--limit=10]',
      [
        'repsclaw query medrxiv --term="machine learning"',
        'repsclaw query medrxiv --term="COVID-19" --limit=20',
      ]
    );
    return;
  }

  if (!parsed.term) {
    printError('MISSING_PARAM', '请提供 --term 参数');
    return;
  }

  try {
    const result = await services.healthAPI.medrxiv.search({
      query: parsed.term as string,
      limit: parsed.limit ? parseInt(parsed.limit as string, 10) : 10,
    });
    printSuccess(result);
  } catch (error) {
    printError('MEDRXIV_ERROR', error instanceof Error ? error.message : String(error));
  }
}

// NCI Bookshelf查询
async function nciBookshelf(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);

  if (parsed.help || parsed.h) {
    printHelp(
      'repsclaw query nci-bookshelf',
      '查询NCBI Bookshelf医学书籍',
      'repsclaw query nci-bookshelf --term=<搜索词> [--limit=10]',
      [
        'repsclaw query nci-bookshelf --term="cancer screening"',
        'repsclaw query nci-bookshelf --term="genetics" --limit=5',
      ]
    );
    return;
  }

  if (!parsed.term) {
    printError('MISSING_PARAM', '请提供 --term 参数');
    return;
  }

  try {
    const result = await services.healthAPI.nciBookshelf.search({
      term: parsed.term as string,
      limit: parsed.limit ? parseInt(parsed.limit as string, 10) : 10,
    });
    printSuccess(result);
  } catch (error) {
    printError('NCI_BOOKSHELF_ERROR', error instanceof Error ? error.message : String(error));
  }
}

// 导出命令
export const queryCommands: Record<string, (argv: string[]) => Promise<void>> = {
  fda,
  pubmed,
  icd10,
  'clinical-trials': clinicalTrials,
  medrxiv,
  'nci-bookshelf': nciBookshelf,
};
