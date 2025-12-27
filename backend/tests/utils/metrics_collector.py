"""
Metrics Collector for AI Chatbot Testing

Collects performance metrics including:
- Response latency
- Time to first token
- RAM usage (process and Docker containers)
- CPU usage
- Token generation rate
"""

import time
import subprocess
import json
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any
from datetime import datetime


@dataclass
class RequestMetrics:
    """Metrics for a single request."""
    test_name: str
    pattern_type: str
    start_time: float
    end_time: float = 0.0
    first_token_time: Optional[float] = None
    total_tokens: int = 0
    success: bool = False
    error: Optional[str] = None
    response_data: Optional[Dict] = None

    @property
    def total_time_ms(self) -> float:
        return (self.end_time - self.start_time) * 1000

    @property
    def time_to_first_token_ms(self) -> Optional[float]:
        if self.first_token_time:
            return (self.first_token_time - self.start_time) * 1000
        return None

    @property
    def tokens_per_second(self) -> Optional[float]:
        if self.total_tokens > 0 and self.total_time_ms > 0:
            return self.total_tokens / (self.total_time_ms / 1000)
        return None


@dataclass
class ResourceMetrics:
    """System resource metrics at a point in time."""
    timestamp: float
    backend_memory_mb: float = 0.0
    ollama_memory_mb: float = 0.0
    backend_cpu_percent: float = 0.0
    ollama_cpu_percent: float = 0.0


@dataclass
class TestResults:
    """Aggregated test results."""
    test_name: str
    total_tests: int = 0
    passed: int = 0
    failed: int = 0
    request_metrics: List[RequestMetrics] = field(default_factory=list)
    resource_metrics: List[ResourceMetrics] = field(default_factory=list)
    baseline_resources: Optional[ResourceMetrics] = None
    peak_resources: Optional[ResourceMetrics] = None

    def add_request(self, metrics: RequestMetrics):
        self.request_metrics.append(metrics)
        self.total_tests += 1
        if metrics.success:
            self.passed += 1
        else:
            self.failed += 1

    def add_resource_snapshot(self, metrics: ResourceMetrics):
        self.resource_metrics.append(metrics)
        # Update peak
        if self.peak_resources is None:
            self.peak_resources = metrics
        else:
            if metrics.backend_memory_mb > self.peak_resources.backend_memory_mb:
                self.peak_resources = ResourceMetrics(
                    timestamp=metrics.timestamp,
                    backend_memory_mb=max(self.peak_resources.backend_memory_mb, metrics.backend_memory_mb),
                    ollama_memory_mb=max(self.peak_resources.ollama_memory_mb, metrics.ollama_memory_mb),
                    backend_cpu_percent=max(self.peak_resources.backend_cpu_percent, metrics.backend_cpu_percent),
                    ollama_cpu_percent=max(self.peak_resources.ollama_cpu_percent, metrics.ollama_cpu_percent),
                )


class MetricsCollector:
    """Collects and aggregates metrics during testing."""

    def __init__(self):
        self.results: Dict[str, TestResults] = {}
        self.current_test: Optional[str] = None

    def start_test_suite(self, name: str) -> TestResults:
        """Start a new test suite."""
        self.results[name] = TestResults(test_name=name)
        self.current_test = name
        # Collect baseline
        baseline = self.collect_resource_metrics()
        self.results[name].baseline_resources = baseline
        return self.results[name]

    def start_request(self, test_name: str, pattern_type: str) -> RequestMetrics:
        """Start timing a request."""
        return RequestMetrics(
            test_name=test_name,
            pattern_type=pattern_type,
            start_time=time.time()
        )

    def end_request(self, metrics: RequestMetrics, success: bool = True,
                    error: Optional[str] = None, response_data: Optional[Dict] = None):
        """End timing a request."""
        metrics.end_time = time.time()
        metrics.success = success
        metrics.error = error
        metrics.response_data = response_data

        if self.current_test and self.current_test in self.results:
            self.results[self.current_test].add_request(metrics)

        return metrics

    def record_first_token(self, metrics: RequestMetrics):
        """Record time when first token is received (for streaming)."""
        if metrics.first_token_time is None:
            metrics.first_token_time = time.time()

    def increment_tokens(self, metrics: RequestMetrics, count: int = 1):
        """Increment token count."""
        metrics.total_tokens += count

    def collect_resource_metrics(self) -> ResourceMetrics:
        """Collect current resource usage from Docker containers."""
        metrics = ResourceMetrics(timestamp=time.time())

        try:
            # Get Docker stats
            result = subprocess.run(
                ["docker", "stats", "--no-stream", "--format",
                 "{{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}"],
                capture_output=True,
                text=True,
                timeout=10
            )

            if result.returncode == 0:
                for line in result.stdout.strip().split('\n'):
                    if not line:
                        continue
                    parts = line.split('\t')
                    if len(parts) >= 3:
                        name, mem, cpu = parts[0], parts[1], parts[2]

                        # Parse memory (e.g., "256MiB / 6GiB")
                        mem_used = self._parse_memory(mem.split('/')[0].strip())
                        cpu_pct = float(cpu.replace('%', '').strip()) if cpu.replace('%', '').strip() else 0.0

                        if 'backend' in name.lower():
                            metrics.backend_memory_mb = mem_used
                            metrics.backend_cpu_percent = cpu_pct
                        elif 'ollama' in name.lower():
                            metrics.ollama_memory_mb = mem_used
                            metrics.ollama_cpu_percent = cpu_pct
        except Exception as e:
            print(f"Warning: Could not collect Docker stats: {e}")

        if self.current_test and self.current_test in self.results:
            self.results[self.current_test].add_resource_snapshot(metrics)

        return metrics

    def _parse_memory(self, mem_str: str) -> float:
        """Parse memory string like '256MiB' or '1.5GiB' to MB."""
        mem_str = mem_str.strip()
        try:
            if 'GiB' in mem_str:
                return float(mem_str.replace('GiB', '').strip()) * 1024
            elif 'MiB' in mem_str:
                return float(mem_str.replace('MiB', '').strip())
            elif 'KiB' in mem_str:
                return float(mem_str.replace('KiB', '').strip()) / 1024
            elif 'GB' in mem_str:
                return float(mem_str.replace('GB', '').strip()) * 1000
            elif 'MB' in mem_str:
                return float(mem_str.replace('MB', '').strip())
            else:
                return 0.0
        except ValueError:
            return 0.0

    def get_summary(self) -> Dict[str, Any]:
        """Get summary of all test results."""
        summary = {
            "timestamp": datetime.now().isoformat(),
            "test_suites": {}
        }

        for name, results in self.results.items():
            request_times = [r.total_time_ms for r in results.request_metrics if r.success]
            ttft_times = [r.time_to_first_token_ms for r in results.request_metrics
                         if r.time_to_first_token_ms is not None]

            suite_summary = {
                "total_tests": results.total_tests,
                "passed": results.passed,
                "failed": results.failed,
                "pass_rate": f"{(results.passed / results.total_tests * 100):.1f}%" if results.total_tests > 0 else "N/A",
                "avg_response_time_ms": sum(request_times) / len(request_times) if request_times else 0,
                "min_response_time_ms": min(request_times) if request_times else 0,
                "max_response_time_ms": max(request_times) if request_times else 0,
                "avg_ttft_ms": sum(ttft_times) / len(ttft_times) if ttft_times else None,
                "baseline_memory": {
                    "backend_mb": results.baseline_resources.backend_memory_mb if results.baseline_resources else 0,
                    "ollama_mb": results.baseline_resources.ollama_memory_mb if results.baseline_resources else 0,
                },
                "peak_memory": {
                    "backend_mb": results.peak_resources.backend_memory_mb if results.peak_resources else 0,
                    "ollama_mb": results.peak_resources.ollama_memory_mb if results.peak_resources else 0,
                },
                "failed_tests": [
                    {"test": r.test_name, "error": r.error}
                    for r in results.request_metrics if not r.success
                ]
            }
            summary["test_suites"][name] = suite_summary

        return summary
