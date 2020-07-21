/**
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as assert from 'assert';
import * as extensionTest from './extension.test';
import * as fs from 'fs';
import * as installTest from './install.test';
import * as marketplaceTest from './marketplace.test';
import * as path from 'path';
import * as webserver from '../test/app_soap';
import { projectPath } from './package_data';
import { VSBrowser } from 'vscode-extension-tester';
import { AsyncProcess, AsyncCommandProcess, TimeoutPromise } from 'vscode-uitests-tooling';
import { expect } from 'chai';

describe('All tests', function () {
	patchProcessExit();
	installTest.test();
	marketplaceTest.test();

	describe('Extension tests', function () {
		this.timeout(4000);
		let browser: VSBrowser;

		before('Setup environment', async function () {
			browser = VSBrowser.instance;
			webserver.startWebService();
		});

		after('Clear environment', async function () {
			this.timeout(15000);
			webserver.stopWebService();
		});

		for (const f of walk(path.join(projectPath, 'src/ui-test/test-data'))) {
			assert(f.endsWith('.json'), `${f} is not json file`);
			const fileContent = fs.readFileSync(f, { encoding: 'utf8' });
			extensionTest.test(JSON.parse(fileContent));
		}
	});

});

/**
 * Iterates over all files which are children of `dir`.
 * @param dir starting directory
 * @returns iterable object of file absolute paths
 */
function* walk(dir: string): Iterable<string> {
	const stack = [dir];

	while (stack.length > 0) {
		const file = stack.pop();
		const stat = fs.statSync(file);

		if (stat && stat.isDirectory()) {
			// add directories and files to stack and transform filenames to absolute paths
			stack.push(...fs.readdirSync(file).map(f => path.join(file, f)));
		} else {
			yield file;
		}
	}
}

function patchProcessExit(): void {
	const oldExit = AsyncProcess.prototype.exit;
	AsyncProcess.prototype.exit = async function(force: boolean, ms?: number): Promise<number> {
		if (process.platform === 'win32') {
			let killResolve = null;

			const args = [
				'/F', // force
				'/T', // kill sub-processes
				'/PID', // use pid
				this.process.pid // pid
			]

			if (!force) {
				args.shift();
			}

			const kill = new AsyncCommandProcess('taskkill', args, {
				shell: true
			});

			kill.spawn();
			kill.process.on('error', expect.fail);
			kill.process.on('exit', (code: number) => killResolve(code))

			const killPromise = new TimeoutPromise((resolve) => killResolve = resolve, ms);

			// wait shell to exit and its sub-processes
			await killPromise.catch((e: any) => expect.fail(`Could not kill process: ${e}`));

			return Promise.resolve(0);
		}
		else {
			return oldExit.call(this, [force, ms]);
		}
	};
}
