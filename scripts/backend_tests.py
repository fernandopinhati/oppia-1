# Copyright 2014 The Oppia Authors. All Rights Reserved.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS-IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""Script for running backend tests in parallel.

This should not be run directly. Instead, navigate to the oppia/ folder and
execute:

    bash scripts/test.sh
"""

import argparse
import datetime
import os
import re
import subprocess
import threading
import time

# DEVELOPERS: Please change this number accordingly when new tests are added
# or removed.
EXPECTED_TEST_COUNT = 325


COVERAGE_PATH = os.path.join(
    os.getcwd(), '..', 'oppia_tools', 'coverage-3.6', 'coverage')
TEST_RUNNER_PATH = os.path.join(os.getcwd(), 'core', 'tests', 'gae_suite.py')
LOG_LOCK = threading.Lock()
ALL_ERRORS = []
# This should be the same as core.test_utils.LOG_LINE_PREFIX.
LOG_LINE_PREFIX = 'LOG_INFO_TEST: '


_PARSER = argparse.ArgumentParser()
_PARSER.add_argument(
    '--generate_coverage_report',
    help='optional; if specified, generates a coverage report',
    action='store_true')
_PARSER.add_argument(
    '--test_target',
    help='optional dotted module name of the test(s) to run',
    type=str)
_PARSER.add_argument(
    '--test_path',
    help='optional subdirectory path containing the test(s) to run',
    type=str)


def log(message, show_time=False):
    """Logs a message to the terminal.

    If show_time is True, prefixes the message with the current time.
    """
    with LOG_LOCK:
        if show_time:
            print datetime.datetime.now().strftime('%H:%M:%S'), message
        else:
            print message


def run_shell_cmd(exe, stdout=subprocess.PIPE, stderr=subprocess.PIPE):
    """Runs a shell command and captures the stdout and stderr output.

    If the cmd fails, raises Exception. Otherwise, returns a string containing
    the concatenation of the stdout and stderr logs.
    """
    p = subprocess.Popen(exe, stdout=stdout, stderr=stderr)
    last_stdout_str, last_stderr_str = p.communicate()
    last_stdout = last_stdout_str.split('\n')

    if LOG_LINE_PREFIX in last_stdout_str:
        log('')
        for line in last_stdout:
            if line.startswith(LOG_LINE_PREFIX):
                log('INFO: %s' % line[len(LOG_LINE_PREFIX): ])
        log('')

    result = '%s%s' % (last_stdout_str, last_stderr_str)

    if p.returncode != 0:
        raise Exception('Error %s\n%s' % (p.returncode, result))

    return result


class TaskThread(threading.Thread):
    """Runs a task in its own thread."""

    def __init__(self, func, name=None):
        super(TaskThread, self).__init__()
        self.func = func
        self.output = None
        self.exception = None
        self.name = name
        self.finished = False

    def run(self):
        try:
            self.output = self.func()
            log('FINISHED %s: %.1f secs' %
                (self.name, time.time() - self.start_time), show_time=True)
            self.finished = True
        except Exception as e:
            self.exception = e
            if 'KeyboardInterrupt' not in str(self.exception):
                log('ERROR %s: %.1f secs' %
                    (self.name, time.time() - self.start_time), show_time=True)
            self.finished = True


class TestingTaskSpec(object):
    """Executes a set of tests given a test class name."""

    def __init__(self, test_target, generate_coverage_report):
        self.test_target = test_target
        self.generate_coverage_report = generate_coverage_report

    def run(self):
        """Runs all tests corresponding to the given test target."""
        test_target_flag = '--test_target=%s' % self.test_target

        if self.generate_coverage_report:
            exc_list = [
                'python', COVERAGE_PATH, '-xp', TEST_RUNNER_PATH,
                test_target_flag]
        else:
            exc_list = ['python', TEST_RUNNER_PATH, test_target_flag]

        return run_shell_cmd(exc_list)


def _check_all_tasks(tasks):
    """Checks the results of all tasks."""
    running_tasks_data = []

    for task in tasks:
        if task.isAlive():
            running_tasks_data.append('  %s (started %s)' % (
                task.name,
                time.strftime('%H:%M:%S', time.localtime(task.start_time))
            ))

        if task.exception:
            ALL_ERRORS.append(task.exception)

    if running_tasks_data:
        log('----------------------------------------')
        log('Tasks still running:')
        for task_details in running_tasks_data:
            log(task_details)
        log('----------------------------------------')


def _execute_tasks(tasks):
    """Starts all tasks and checks the results."""
    # Start all tasks.
    for task in tasks:
        task.start()
        task.start_time = time.time()

    # Note that the main thread (i.e. the original process that runs this
    # script) is also counted in threading.active_count().
    while threading.active_count() > 1:
        time.sleep(5)
        _check_all_tasks(tasks)


def _get_all_test_targets(test_path=None):
    """Returns a list of test targets for all classes under test_path
    containing tests.
    """
    def _convert_to_test_target(path):
        """Remove the .py suffix and replace all slashes with periods."""
        return os.path.relpath(path, os.getcwd())[:-3].replace('/', '.')

    base_path = os.path.join(os.getcwd(), test_path or '')
    result = []
    for root in os.listdir(base_path):
        if any([s in root for s in ['.git', 'third_party', 'core/tests']]):
            continue
        if root.endswith('_test.py'):
            result.append(_convert_to_test_target(
                os.path.join(base_path, root)))
        for subroot, _, files in os.walk(os.path.join(base_path, root)):
            for f in files:
                if (f.endswith('_test.py') and
                        os.path.join('core', 'tests') not in subroot):
                    result.append(_convert_to_test_target(
                        os.path.join(subroot, f)))

    return result


def main():
    """Run the tests."""
    parsed_args = _PARSER.parse_args()
    if parsed_args.test_target and parsed_args.test_path:
        raise Exception('At most one of test_path and test_target '
                        'should be specified.')
    if parsed_args.test_path and '.' in parsed_args.test_path:
        raise Exception('The delimiter in test_path should be a slash (/)')
    if parsed_args.test_target and '/' in parsed_args.test_target:
        raise Exception('The delimiter in test_target should be a dot (.)')

    if parsed_args.test_target:
        all_test_targets = [parsed_args.test_target]
    else:
        all_test_targets = _get_all_test_targets(
            test_path=parsed_args.test_path)

    # Prepare tasks.
    task_to_taskspec = {}
    tasks = []
    for test_target in all_test_targets:
        test = TestingTaskSpec(
            test_target, parsed_args.generate_coverage_report)
        task = TaskThread(test.run, name=test_target)
        task_to_taskspec[task] = test
        tasks.append(task)

    task_execution_failed = False
    try:
        _execute_tasks(tasks)
    except:
        task_execution_failed = True

    for task in tasks:
        if task.exception:
            log(str(task.exception))

    print ''
    print '+------------------+'
    print '| SUMMARY OF TESTS |'
    print '+------------------+'
    print ''

    # Check we ran all tests as expected.
    total_count = 0
    for task in tasks:
        spec = task_to_taskspec[task]

        if not task.finished:
            print 'CANCELED  %s' % spec.test_target
            test_count = 0
        elif 'No tests were run' in str(task.exception):
            print 'ERROR     %s: No tests found.' % spec.test_target
            test_count = 0
        elif task.exception:
            exc_str = unicode(task.exception)
            print exc_str[exc_str.find('=') : exc_str.rfind('-')]

            tests_failed_regex_match = re.search(
                r'Test suite failed: ([0-9]+) tests run, ([0-9]+) errors, '
                    '([0-9]+) failures',
                str(task.exception))
            test_count = int(tests_failed_regex_match.group(1))
            errors = int(tests_failed_regex_match.group(2))
            failures = int(tests_failed_regex_match.group(3))
            print 'FAILED    %s: %s errors, %s failures' % (
                spec.test_target, errors, failures)
        else:
            tests_run_regex_match = re.search(
                r'Ran ([0-9]+) tests? in ([0-9\.]+)s', task.output)
            test_count = int(tests_run_regex_match.group(1))
            test_time = float(tests_run_regex_match.group(2))
            print ('SUCCESS   %s: %d tests (%.1f secs)' %
                   (spec.test_target, test_count, test_time))

        total_count += test_count

    print ''
    if total_count == 0:
        raise Exception('WARNING: No tests were run.')
    elif (parsed_args.test_path is None and parsed_args.test_target is None
            and total_count != EXPECTED_TEST_COUNT):
        raise Exception(
            'ERROR: Expected %s tests to be run, not %s.' %
            (EXPECTED_TEST_COUNT, total_count))
    else:
        print 'Successfully ran %s test%s in %s test class%s.' % (
            total_count, '' if total_count == 1 else 's',
            len(tasks), '' if len(tasks) == 1 else 'es')

    if task_execution_failed:
        raise Exception('Task execution failed.')


if __name__ == '__main__':
    main()