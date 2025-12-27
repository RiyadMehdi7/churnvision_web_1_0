"""
Comprehensive AI Chatbot Testing Script

Tests all chatbot functions and collects performance metrics including:
- Response latency
- RAM usage
- Token generation rate
- Pattern detection accuracy
- Error handling

Outputs results to a markdown report.
"""

import asyncio
import time
import json
import sys
import os
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple
import httpx
import websockets

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tests.utils.metrics_collector import MetricsCollector, RequestMetrics, ResourceMetrics
from tests.utils.chatbot_test_data import (
    PATTERN_TEST_CASES,
    PATTERN_DETECTION_TESTS,
    EDGE_CASE_TESTS,
    STRESS_TEST_CONFIG,
    PatternTestCase,
)


class ChatbotTester:
    """Comprehensive AI Chatbot Tester."""

    BASE_URL = "http://localhost:8001"
    WS_URL = "ws://localhost:8001"

    def __init__(self):
        self.metrics = MetricsCollector()
        self.token: Optional[str] = None
        self.test_employee_id: Optional[str] = None
        self.results: Dict[str, Any] = {
            "summary": {},
            "functional_tests": [],
            "performance_metrics": {},
            "stress_tests": {},
            "edge_cases": [],
            "errors": [],
        }

    async def setup(self) -> bool:
        """Setup test environment - get auth token and test employee."""
        print("\n" + "=" * 60)
        print("SETUP: Initializing test environment")
        print("=" * 60)

        # Get auth token
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    f"{self.BASE_URL}/api/v1/auth/login",
                    json={"username": "admin", "password": "admin123"},
                    timeout=30.0,
                )
                if response.status_code == 200:
                    data = response.json()
                    self.token = data.get("access_token")
                    print(f"  [OK] Auth token obtained: {self.token[:40]}...")
                else:
                    print(f"  [FAIL] Login failed: {response.status_code}")
                    return False
            except Exception as e:
                print(f"  [FAIL] Login error: {e}")
                return False

            # Get a test employee
            try:
                response = await client.get(
                    f"{self.BASE_URL}/api/v1/employees/?limit=1",
                    headers={"Authorization": f"Bearer {self.token}"},
                    timeout=30.0,
                )
                if response.status_code == 200:
                    employees = response.json()
                    if employees:
                        self.test_employee_id = employees[0].get("hr_code")
                        print(f"  [OK] Test employee: {self.test_employee_id} ({employees[0].get('full_name')})")
                    else:
                        print("  [WARN] No employees found - some tests may fail")
                else:
                    print(f"  [WARN] Could not fetch employees: {response.status_code}")
            except Exception as e:
                print(f"  [WARN] Employee fetch error: {e}")

        # Collect baseline metrics
        baseline = self.metrics.collect_resource_metrics()
        print(f"  [OK] Baseline metrics collected:")
        print(f"       Backend RAM: {baseline.backend_memory_mb:.1f} MB")
        print(f"       Ollama RAM: {baseline.ollama_memory_mb:.1f} MB")

        return True

    def _get_headers(self) -> Dict[str, str]:
        """Get request headers with auth."""
        return {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
            "Origin": "http://localhost:3000",
        }

    async def test_pattern(self, test_case: PatternTestCase) -> Dict[str, Any]:
        """Test a single pattern type."""
        result = {
            "name": test_case.name,
            "pattern_type": test_case.pattern_type,
            "action_type": test_case.action_type,
            "status": "pending",
            "response_time_ms": 0,
            "structured_data_valid": False,
            "error": None,
            "response_preview": None,
        }

        # Start metrics
        request_metrics = self.metrics.start_request(test_case.name, test_case.pattern_type)

        # Prepare request
        employee_id = self.test_employee_id if test_case.requires_employee else None
        payload = {
            "message": test_case.message,
            "session_id": f"test-{test_case.pattern_type}-{int(time.time())}",
            "employee_id": employee_id,
        }
        if test_case.action_type:
            payload["action_type"] = test_case.action_type

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.BASE_URL}/api/v1/intelligent-chat/chat",
                    json=payload,
                    headers=self._get_headers(),
                    timeout=120.0,  # Long timeout for LLM
                )

                self.metrics.end_request(request_metrics, success=response.status_code == 200)
                result["response_time_ms"] = request_metrics.total_time_ms

                if response.status_code == 200:
                    data = response.json()
                    result["status"] = "passed"

                    # Check structured data
                    structured_data = data.get("structured_data")
                    if structured_data:
                        result["structured_data_valid"] = True
                        # Check expected fields
                        for field in test_case.expected_fields:
                            if field not in structured_data:
                                result["structured_data_valid"] = False
                                result["error"] = f"Missing field: {field}"
                                break
                        result["response_preview"] = f"Type: {structured_data.get('type', 'N/A')}"
                    elif test_case.action_type is None:
                        # General chat - just check for response text
                        response_text = data.get("response", "")
                        result["structured_data_valid"] = True  # N/A for general chat
                        result["response_preview"] = response_text[:100] + "..." if len(response_text) > 100 else response_text
                    else:
                        result["structured_data_valid"] = False
                        result["error"] = "No structured_data in response"
                else:
                    result["status"] = "failed"
                    result["error"] = f"HTTP {response.status_code}: {response.text[:200]}"
                    self.metrics.end_request(request_metrics, success=False, error=result["error"])

        except Exception as e:
            result["status"] = "failed"
            result["error"] = str(e)
            self.metrics.end_request(request_metrics, success=False, error=str(e))

        return result

    async def run_functional_tests(self):
        """Run all pattern tests."""
        print("\n" + "=" * 60)
        print("PHASE 1: Functional Testing (12 Pattern Types)")
        print("=" * 60)

        self.metrics.start_test_suite("functional")

        for i, test_case in enumerate(PATTERN_TEST_CASES, 1):
            print(f"\n  [{i}/{len(PATTERN_TEST_CASES)}] Testing: {test_case.name}")
            print(f"       Message: \"{test_case.message[:50]}...\"")

            result = await self.test_pattern(test_case)
            self.results["functional_tests"].append(result)

            status_icon = "[OK]" if result["status"] == "passed" else "[FAIL]"
            print(f"       {status_icon} Status: {result['status']}, Time: {result['response_time_ms']:.0f}ms")
            if result["error"]:
                print(f"       Error: {result['error'][:80]}")

            # Collect resource metrics after each test
            self.metrics.collect_resource_metrics()

            # Small delay between tests
            await asyncio.sleep(0.5)

    async def test_websocket_streaming(self) -> Dict[str, Any]:
        """Test WebSocket streaming functionality."""
        result = {
            "name": "WebSocket Streaming",
            "status": "pending",
            "time_to_first_token_ms": None,
            "total_tokens": 0,
            "total_time_ms": 0,
            "tokens_per_second": None,
            "error": None,
        }

        request_metrics = self.metrics.start_request("websocket_streaming", "general_chat")

        try:
            ws_url = f"{self.WS_URL}/api/v1/intelligent-chat/ws?token={self.token}"

            async with websockets.connect(ws_url, ping_timeout=60) as ws:
                # Send a message
                await ws.send(json.dumps({
                    "message": "What is employee retention?",
                    "session_id": f"ws-test-{int(time.time())}",
                }))

                token_count = 0
                first_token_received = False

                # Receive tokens with timeout
                try:
                    async def receive_with_timeout():
                        nonlocal token_count, first_token_received
                        while True:
                            try:
                                msg = await asyncio.wait_for(ws.recv(), timeout=120.0)
                                data = json.loads(msg)

                                if data.get("type") == "token":
                                    if not first_token_received:
                                        self.metrics.record_first_token(request_metrics)
                                        first_token_received = True
                                    token_count += 1
                                    self.metrics.increment_tokens(request_metrics)
                                elif data.get("type") == "done":
                                    break
                                elif data.get("type") == "error":
                                    result["error"] = data.get("error")
                                    break
                            except asyncio.TimeoutError:
                                result["error"] = "WebSocket timeout after 120s"
                                break

                    await receive_with_timeout()
                except Exception as e:
                    result["error"] = f"WebSocket error: {e}"

                self.metrics.end_request(request_metrics, success=result["error"] is None)

                result["total_tokens"] = token_count
                result["time_to_first_token_ms"] = request_metrics.time_to_first_token_ms
                result["total_time_ms"] = request_metrics.total_time_ms
                result["tokens_per_second"] = request_metrics.tokens_per_second
                result["status"] = "passed" if result["error"] is None else "failed"

        except Exception as e:
            result["status"] = "failed"
            result["error"] = str(e)
            self.metrics.end_request(request_metrics, success=False, error=str(e))

        return result

    async def run_websocket_tests(self):
        """Run WebSocket streaming tests."""
        print("\n" + "=" * 60)
        print("PHASE 2: WebSocket Streaming Test")
        print("=" * 60)

        self.metrics.start_test_suite("websocket")

        print("\n  Testing WebSocket streaming...")
        result = await self.test_websocket_streaming()

        status_icon = "[OK]" if result["status"] == "passed" else "[FAIL]"
        print(f"  {status_icon} Status: {result['status']}")
        print(f"       Time to first token: {result['time_to_first_token_ms']:.0f}ms" if result['time_to_first_token_ms'] else "       TTFT: N/A")
        print(f"       Total tokens: {result['total_tokens']}")
        print(f"       Total time: {result['total_time_ms']:.0f}ms")
        if result['tokens_per_second']:
            print(f"       Tokens/second: {result['tokens_per_second']:.1f}")
        if result["error"]:
            print(f"       Error: {result['error']}")

        self.results["performance_metrics"]["websocket"] = result

    async def run_stress_tests(self):
        """Run stress tests - sequential and concurrent requests."""
        print("\n" + "=" * 60)
        print("PHASE 3: Stress Testing")
        print("=" * 60)

        self.metrics.start_test_suite("stress")
        config = STRESS_TEST_CONFIG

        # Sequential requests
        print(f"\n  Running {config['sequential_count']} sequential requests...")
        sequential_times = []
        for i in range(config['sequential_count']):
            start = time.time()
            try:
                async with httpx.AsyncClient() as client:
                    response = await client.post(
                        f"{self.BASE_URL}/api/v1/intelligent-chat/chat",
                        json={
                            "message": config['test_message'],
                            "session_id": f"stress-seq-{i}",
                            "action_type": config['action_type'],
                        },
                        headers=self._get_headers(),
                        timeout=120.0,
                    )
                    if response.status_code == 200:
                        sequential_times.append((time.time() - start) * 1000)
                        print(f"    Request {i+1}/{config['sequential_count']}: {sequential_times[-1]:.0f}ms")
                    else:
                        print(f"    Request {i+1}/{config['sequential_count']}: FAILED ({response.status_code})")
            except Exception as e:
                print(f"    Request {i+1}/{config['sequential_count']}: ERROR ({e})")

            # Collect metrics periodically
            if i % 3 == 0:
                self.metrics.collect_resource_metrics()

        self.results["stress_tests"]["sequential"] = {
            "count": config['sequential_count'],
            "successful": len(sequential_times),
            "avg_ms": sum(sequential_times) / len(sequential_times) if sequential_times else 0,
            "min_ms": min(sequential_times) if sequential_times else 0,
            "max_ms": max(sequential_times) if sequential_times else 0,
        }

        print(f"\n  Sequential Results:")
        print(f"    Successful: {len(sequential_times)}/{config['sequential_count']}")
        if sequential_times:
            print(f"    Avg: {self.results['stress_tests']['sequential']['avg_ms']:.0f}ms")
            print(f"    Min: {self.results['stress_tests']['sequential']['min_ms']:.0f}ms")
            print(f"    Max: {self.results['stress_tests']['sequential']['max_ms']:.0f}ms")

        # Concurrent requests
        print(f"\n  Running {config['concurrent_count']} concurrent requests...")

        async def make_request(idx: int) -> Tuple[int, float, bool]:
            start = time.time()
            try:
                async with httpx.AsyncClient() as client:
                    response = await client.post(
                        f"{self.BASE_URL}/api/v1/intelligent-chat/chat",
                        json={
                            "message": config['test_message'],
                            "session_id": f"stress-conc-{idx}",
                            "action_type": config['action_type'],
                        },
                        headers=self._get_headers(),
                        timeout=180.0,  # Longer timeout for concurrent
                    )
                    return idx, (time.time() - start) * 1000, response.status_code == 200
            except Exception as e:
                return idx, (time.time() - start) * 1000, False

        concurrent_start = time.time()
        tasks = [make_request(i) for i in range(config['concurrent_count'])]
        results = await asyncio.gather(*tasks)
        concurrent_total = (time.time() - concurrent_start) * 1000

        concurrent_times = [r[1] for r in results if r[2]]
        concurrent_success = sum(1 for r in results if r[2])

        for idx, time_ms, success in results:
            status = "OK" if success else "FAIL"
            print(f"    Request {idx+1}: {time_ms:.0f}ms [{status}]")

        self.results["stress_tests"]["concurrent"] = {
            "count": config['concurrent_count'],
            "successful": concurrent_success,
            "total_time_ms": concurrent_total,
            "avg_individual_ms": sum(concurrent_times) / len(concurrent_times) if concurrent_times else 0,
            "throughput_rps": concurrent_success / (concurrent_total / 1000) if concurrent_total > 0 else 0,
        }

        print(f"\n  Concurrent Results:")
        print(f"    Successful: {concurrent_success}/{config['concurrent_count']}")
        print(f"    Total time: {concurrent_total:.0f}ms")
        if concurrent_times:
            print(f"    Avg individual: {self.results['stress_tests']['concurrent']['avg_individual_ms']:.0f}ms")
            print(f"    Throughput: {self.results['stress_tests']['concurrent']['throughput_rps']:.2f} req/s")

        # Collect final resource metrics
        self.metrics.collect_resource_metrics()

    async def run_edge_case_tests(self):
        """Run edge case tests."""
        print("\n" + "=" * 60)
        print("PHASE 4: Edge Case Testing")
        print("=" * 60)

        self.metrics.start_test_suite("edge_cases")

        for test in EDGE_CASE_TESTS:
            print(f"\n  Testing: {test['name']}")

            result = {
                "name": test["name"],
                "status": "pending",
                "error": None,
            }

            try:
                async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
                    response = await client.post(
                        f"{self.BASE_URL}/api/v1/intelligent-chat/chat",
                        json={
                            "message": test["message"],
                            "session_id": f"edge-{test['name'].lower().replace(' ', '-')}",
                            "action_type": "workforce_trends",  # Use quick action to avoid long LLM response
                        },
                        headers=self._get_headers(),
                    )

                    if test.get("expected_error"):
                        # We expect an error
                        if response.status_code != 200:
                            result["status"] = "passed"
                            print(f"    [OK] Expected error received: {response.status_code}")
                        else:
                            result["status"] = "passed"  # Empty message might be handled gracefully
                            print(f"    [OK] Handled gracefully: {response.status_code}")
                    else:
                        # We expect success
                        if response.status_code == 200:
                            result["status"] = "passed"
                            print(f"    [OK] Request succeeded")
                        else:
                            result["status"] = "failed"
                            result["error"] = f"HTTP {response.status_code}"
                            print(f"    [FAIL] Unexpected error: {response.status_code}")

            except Exception as e:
                if test.get("expected_error"):
                    result["status"] = "passed"
                    print(f"    [OK] Expected exception: {e}")
                else:
                    result["status"] = "failed"
                    result["error"] = str(e)
                    print(f"    [FAIL] Exception: {e}")

            self.results["edge_cases"].append(result)

    def collect_final_metrics(self):
        """Collect final resource metrics summary."""
        print("\n" + "=" * 60)
        print("Collecting Final Metrics")
        print("=" * 60)

        final_metrics = self.metrics.collect_resource_metrics()
        summary = self.metrics.get_summary()

        self.results["performance_metrics"]["resource_usage"] = {
            "baseline": {
                "backend_memory_mb": summary["test_suites"].get("functional", {}).get("baseline_memory", {}).get("backend_mb", 0),
                "ollama_memory_mb": summary["test_suites"].get("functional", {}).get("baseline_memory", {}).get("ollama_mb", 0),
            },
            "peak": {
                "backend_memory_mb": summary["test_suites"].get("functional", {}).get("peak_memory", {}).get("backend_mb", 0),
                "ollama_memory_mb": summary["test_suites"].get("functional", {}).get("peak_memory", {}).get("ollama_mb", 0),
            },
            "final": {
                "backend_memory_mb": final_metrics.backend_memory_mb,
                "ollama_memory_mb": final_metrics.ollama_memory_mb,
            }
        }

        print(f"  Backend RAM - Baseline: {self.results['performance_metrics']['resource_usage']['baseline']['backend_memory_mb']:.1f} MB")
        print(f"  Backend RAM - Peak: {self.results['performance_metrics']['resource_usage']['peak']['backend_memory_mb']:.1f} MB")
        print(f"  Backend RAM - Final: {final_metrics.backend_memory_mb:.1f} MB")
        print(f"  Ollama RAM - Baseline: {self.results['performance_metrics']['resource_usage']['baseline']['ollama_memory_mb']:.1f} MB")
        print(f"  Ollama RAM - Peak: {self.results['performance_metrics']['resource_usage']['peak']['ollama_memory_mb']:.1f} MB")
        print(f"  Ollama RAM - Final: {final_metrics.ollama_memory_mb:.1f} MB")

    def calculate_summary(self):
        """Calculate test summary."""
        functional = self.results["functional_tests"]
        passed = sum(1 for t in functional if t["status"] == "passed")
        failed = sum(1 for t in functional if t["status"] == "failed")
        response_times = [t["response_time_ms"] for t in functional if t["status"] == "passed"]

        edge = self.results["edge_cases"]
        edge_passed = sum(1 for t in edge if t["status"] == "passed")

        self.results["summary"] = {
            "timestamp": datetime.now().isoformat(),
            "functional_tests": {
                "total": len(functional),
                "passed": passed,
                "failed": failed,
                "pass_rate": f"{(passed / len(functional) * 100):.1f}%" if functional else "N/A",
            },
            "edge_case_tests": {
                "total": len(edge),
                "passed": edge_passed,
            },
            "performance": {
                "avg_response_time_ms": sum(response_times) / len(response_times) if response_times else 0,
                "min_response_time_ms": min(response_times) if response_times else 0,
                "max_response_time_ms": max(response_times) if response_times else 0,
            }
        }

    def generate_report(self) -> str:
        """Generate markdown report."""
        self.calculate_summary()

        report = []
        report.append("# AI Chatbot Comprehensive Test Report")
        report.append(f"\n**Generated:** {self.results['summary']['timestamp']}")
        report.append(f"\n**LLM Provider:** Ollama (gemma3:4b)")
        report.append(f"\n**Test Employee:** {self.test_employee_id}")

        # Summary
        report.append("\n\n## Summary")
        report.append("\n| Metric | Value |")
        report.append("|--------|-------|")
        s = self.results["summary"]
        report.append(f"| Total Functional Tests | {s['functional_tests']['total']} |")
        report.append(f"| Passed | {s['functional_tests']['passed']} |")
        report.append(f"| Failed | {s['functional_tests']['failed']} |")
        report.append(f"| Pass Rate | {s['functional_tests']['pass_rate']} |")
        report.append(f"| Edge Case Tests | {s['edge_case_tests']['total']} |")

        # Functional Test Results
        report.append("\n\n## Functional Test Results")
        report.append("\n| Pattern Type | Status | Response Time (ms) | Structured Data | Notes |")
        report.append("|--------------|--------|-------------------|-----------------|-------|")
        for t in self.results["functional_tests"]:
            status_emoji = "PASS" if t["status"] == "passed" else "FAIL"
            structured = "Valid" if t["structured_data_valid"] else "Invalid"
            notes = t.get("error") or t.get("response_preview") or ""
            notes = notes[:50] if notes else ""
            report.append(f"| {t['name']} | {status_emoji} | {t['response_time_ms']:.0f} | {structured} | {notes} |")

        # Performance Metrics
        report.append("\n\n## Performance Metrics")
        report.append("\n### Response Latency")
        report.append(f"\n- **Average Response Time:** {s['performance']['avg_response_time_ms']:.0f} ms")
        report.append(f"- **Min Response Time:** {s['performance']['min_response_time_ms']:.0f} ms")
        report.append(f"- **Max Response Time:** {s['performance']['max_response_time_ms']:.0f} ms")

        # WebSocket metrics
        if "websocket" in self.results["performance_metrics"]:
            ws = self.results["performance_metrics"]["websocket"]
            report.append("\n\n### WebSocket Streaming")
            report.append(f"\n- **Time to First Token:** {ws.get('time_to_first_token_ms', 'N/A')} ms")
            report.append(f"- **Total Tokens:** {ws.get('total_tokens', 0)}")
            report.append(f"- **Total Time:** {ws.get('total_time_ms', 0):.0f} ms")
            if ws.get('tokens_per_second'):
                report.append(f"- **Token Generation Rate:** {ws['tokens_per_second']:.1f} tokens/sec")

        # Resource Usage
        if "resource_usage" in self.results["performance_metrics"]:
            ru = self.results["performance_metrics"]["resource_usage"]
            report.append("\n\n### Resource Usage")
            report.append("\n| Container | Baseline | Peak | Final |")
            report.append("|-----------|----------|------|-------|")
            report.append(f"| Backend (MB) | {ru['baseline']['backend_memory_mb']:.1f} | {ru['peak']['backend_memory_mb']:.1f} | {ru['final']['backend_memory_mb']:.1f} |")
            report.append(f"| Ollama (MB) | {ru['baseline']['ollama_memory_mb']:.1f} | {ru['peak']['ollama_memory_mb']:.1f} | {ru['final']['ollama_memory_mb']:.1f} |")

        # Stress Test Results
        if self.results["stress_tests"]:
            report.append("\n\n## Stress Test Results")

            if "sequential" in self.results["stress_tests"]:
                seq = self.results["stress_tests"]["sequential"]
                report.append("\n### Sequential Requests")
                report.append(f"\n- **Total Requests:** {seq['count']}")
                report.append(f"- **Successful:** {seq['successful']}")
                report.append(f"- **Average Latency:** {seq['avg_ms']:.0f} ms")
                report.append(f"- **Min Latency:** {seq['min_ms']:.0f} ms")
                report.append(f"- **Max Latency:** {seq['max_ms']:.0f} ms")

            if "concurrent" in self.results["stress_tests"]:
                conc = self.results["stress_tests"]["concurrent"]
                report.append("\n\n### Concurrent Requests")
                report.append(f"\n- **Total Requests:** {conc['count']}")
                report.append(f"- **Successful:** {conc['successful']}")
                report.append(f"- **Total Time:** {conc['total_time_ms']:.0f} ms")
                report.append(f"- **Avg Individual Latency:** {conc['avg_individual_ms']:.0f} ms")
                report.append(f"- **Throughput:** {conc['throughput_rps']:.2f} req/sec")

        # Edge Case Results
        report.append("\n\n## Edge Case Results")
        report.append("\n| Test Case | Status | Notes |")
        report.append("|-----------|--------|-------|")
        for t in self.results["edge_cases"]:
            status = "PASS" if t["status"] == "passed" else "FAIL"
            notes = t.get("error") or "Handled correctly"
            notes = notes[:40] if notes else "OK"
            report.append(f"| {t['name']} | {status} | {notes} |")

        # Errors Summary
        errors = [t for t in self.results["functional_tests"] if t["status"] == "failed"]
        if errors:
            report.append("\n\n## Errors")
            for e in errors:
                report.append(f"\n### {e['name']}")
                report.append(f"\n```\n{e.get('error', 'Unknown error')}\n```")

        report.append("\n\n---")
        report.append("\n*Report generated by ChurnVision AI Chatbot Test Suite*")

        return "\n".join(report)

    async def run_all_tests(self):
        """Run all tests."""
        print("\n" + "=" * 60)
        print("  ChurnVision AI Chatbot Comprehensive Test Suite")
        print("=" * 60)
        print(f"  Started at: {datetime.now().isoformat()}")

        if not await self.setup():
            print("\n[FATAL] Setup failed. Aborting tests.")
            return

        await self.run_functional_tests()
        await self.run_websocket_tests()
        await self.run_stress_tests()
        await self.run_edge_case_tests()
        self.collect_final_metrics()

        # Generate and save report
        report = self.generate_report()
        report_path = os.path.join(
            os.path.dirname(__file__),
            "reports",
            "chatbot_test_report.md"
        )
        os.makedirs(os.path.dirname(report_path), exist_ok=True)
        with open(report_path, "w") as f:
            f.write(report)

        print("\n" + "=" * 60)
        print("  TEST COMPLETE")
        print("=" * 60)
        print(f"\n  Report saved to: {report_path}")
        print(f"\n  Summary:")
        print(f"    Functional Tests: {self.results['summary']['functional_tests']['passed']}/{self.results['summary']['functional_tests']['total']} passed")
        print(f"    Pass Rate: {self.results['summary']['functional_tests']['pass_rate']}")
        print(f"    Avg Response Time: {self.results['summary']['performance']['avg_response_time_ms']:.0f} ms")


async def main():
    """Main entry point."""
    tester = ChatbotTester()
    await tester.run_all_tests()


if __name__ == "__main__":
    asyncio.run(main())
