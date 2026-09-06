import fs from 'node:fs';
import path from 'node:path';

export class TestReporter {
  constructor(suite, version = '0.3.0') {
    this.suite = suite;
    this.version = version;
    this.cases = [];
  }

  check(id, condition, evidence) {
    this.cases.push({
      id,
      status: condition ? 'PASS' : 'FAIL',
      evidence
    });
  }

  async test(id, callback, evidence = '') {
    try {
      const result = await callback();
      const pass = result === undefined ? true : Boolean(result);
      this.check(id, pass, evidence || (pass ? 'Completed without error.' : 'Returned false.'));
    } catch (error) {
      this.cases.push({
        id,
        status: 'FAIL',
        evidence: `${error?.name ?? 'Error'}: ${error?.message ?? String(error)}`
      });
    }
  }

  finish(outputPath) {
    const passed = this.cases.filter((item) => item.status === 'PASS').length;
    const failed = this.cases.filter((item) => item.status === 'FAIL').length;
    const result = {
      version: this.version,
      suite: this.suite,
      executedAt: new Date().toISOString(),
      summary: { total: this.cases.length, passed, failed, notRun: 0 },
      cases: this.cases
    };

    for (const item of this.cases) {
      console.log(`${item.status} ${item.id} - ${item.evidence}`);
    }
    console.log(`\n${this.suite}: TOTAL ${this.cases.length} / PASS ${passed} / FAIL ${failed}`);

    if (outputPath) {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    }

    if (failed > 0) process.exitCode = 1;
    return result;
  }
}
