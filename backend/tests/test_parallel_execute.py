"""Tests for the parallel_execute utility function."""

import asyncio
import pytest

from app.agents.strands_agents import parallel_execute


@pytest.mark.asyncio
async def test_all_tasks_succeed():
    """All successful coroutines return their results in order."""

    async def task_a():
        return {"value": "a"}

    async def task_b():
        return {"value": "b"}

    results = await parallel_execute([task_a(), task_b()])
    assert results == [{"value": "a"}, {"value": "b"}]


@pytest.mark.asyncio
async def test_empty_task_list():
    """An empty task list returns an empty result list."""
    results = await parallel_execute([])
    assert results == []


@pytest.mark.asyncio
async def test_timeout_produces_partial_error():
    """A task exceeding the timeout returns a partial failure dict."""

    async def slow_task():
        await asyncio.sleep(5)
        return {"value": "never"}

    async def fast_task():
        return {"value": "fast"}

    results = await parallel_execute([slow_task(), fast_task()], timeout=0.1)
    # First task should have timed out
    assert results[0]["partial"] is True
    assert "timed out" in results[0]["error"]
    # Second task should succeed
    assert results[1] == {"value": "fast"}


@pytest.mark.asyncio
async def test_exception_produces_partial_error():
    """A task that raises an exception returns a partial failure dict."""

    async def failing_task():
        raise ValueError("something went wrong")

    async def ok_task():
        return {"value": "ok"}

    results = await parallel_execute([failing_task(), ok_task()])
    # First task should have the error
    assert results[0]["partial"] is True
    assert "ValueError" in results[0]["error"]
    assert "something went wrong" in results[0]["error"]
    # Second task should succeed
    assert results[1] == {"value": "ok"}


@pytest.mark.asyncio
async def test_mixed_success_timeout_and_exception():
    """Mixed results: success, timeout, and exception all handled correctly."""

    async def success_task():
        return {"status": "done"}

    async def timeout_task():
        await asyncio.sleep(10)
        return {"status": "never"}

    async def error_task():
        raise RuntimeError("boom")

    results = await parallel_execute(
        [success_task(), timeout_task(), error_task()], timeout=0.1
    )
    assert results[0] == {"status": "done"}
    assert results[1]["partial"] is True
    assert "timed out" in results[1]["error"]
    assert results[2]["partial"] is True
    assert "RuntimeError" in results[2]["error"]


@pytest.mark.asyncio
async def test_custom_timeout_value():
    """Custom timeout value is respected."""

    async def medium_task():
        await asyncio.sleep(0.3)
        return {"value": "completed"}

    # With a 1.0s timeout, the 0.3s task should succeed
    results = await parallel_execute([medium_task()], timeout=1.0)
    assert results[0] == {"value": "completed"}

    # With a 0.1s timeout, the 0.3s task should fail
    results = await parallel_execute([medium_task()], timeout=0.1)
    assert results[0]["partial"] is True
    assert "timed out" in results[0]["error"]


@pytest.mark.asyncio
async def test_results_preserve_order():
    """Results are returned in the same order as input tasks."""

    async def task_with_delay(value: str, delay: float):
        await asyncio.sleep(delay)
        return {"value": value}

    # Task 2 finishes first, but results should be in input order
    results = await parallel_execute(
        [task_with_delay("first", 0.2), task_with_delay("second", 0.05), task_with_delay("third", 0.1)],
        timeout=2.0,
    )
    assert results[0] == {"value": "first"}
    assert results[1] == {"value": "second"}
    assert results[2] == {"value": "third"}


@pytest.mark.asyncio
async def test_non_dict_results_pass_through():
    """Non-dict results (strings, lists, etc.) pass through unchanged."""

    async def string_task():
        return "hello"

    async def list_task():
        return [1, 2, 3]

    async def int_task():
        return 42

    results = await parallel_execute([string_task(), list_task(), int_task()])
    assert results[0] == "hello"
    assert results[1] == [1, 2, 3]
    assert results[2] == 42
