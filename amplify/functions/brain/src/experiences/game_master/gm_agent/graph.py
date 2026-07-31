from __future__ import annotations

import logging
from collections.abc import Generator

from langgraph.graph import END, StateGraph
from langgraph.graph.state import CompiledStateGraph

from experiences.game_master.gm_agent.nodes import (
    agent_node,
    assemble_context_node,
    execute_tools_node,
    extract_response_node,
)
from experiences.game_master.gm_agent.state import MAX_TOOL_CALLS, GMAgentState

logger = logging.getLogger(__name__)


def _route_after_agent(state: GMAgentState) -> str:
    """Route to tool execution if the agent called tools, otherwise extract response."""
    messages = state.get("messages", [])
    if not messages:
        return "extract_response"

    tool_call_count = state.get("tool_call_count", 0)
    if tool_call_count >= MAX_TOOL_CALLS:
        logger.warning("Max tool calls (%d) reached, forcing response extraction", MAX_TOOL_CALLS)
        return "extract_response"

    last_msg = messages[-1]
    content = last_msg.get("content", [])

    if isinstance(content, list):
        has_tool_use = any(
            isinstance(block, dict) and block.get("type") == "tool_use"
            for block in content
        )
        if has_tool_use:
            return "execute_tools"

    return "extract_response"


def _route_after_tools(state: GMAgentState) -> str:
    """Route back to agent if tools were executed, otherwise extract response."""
    messages = state.get("messages", [])
    if not messages:
        return "extract_response"

    last_msg = messages[-1]
    content = last_msg.get("content", [])

    if isinstance(content, list):
        has_tool_results = any(
            isinstance(block, dict) and block.get("type") == "tool_result"
            for block in content
        )
        if has_tool_results:
            return "agent"

    return "extract_response"


def build_gm_agent() -> CompiledStateGraph:
    """Build and compile the LangGraph agent for the Game Master."""
    builder = StateGraph(GMAgentState)

    builder.add_node("assemble_context", assemble_context_node)
    builder.add_node("agent", agent_node)
    builder.add_node("execute_tools", execute_tools_node)
    builder.add_node("extract_response", extract_response_node)

    builder.set_entry_point("assemble_context")
    builder.add_edge("assemble_context", "agent")
    builder.add_conditional_edges(
        "agent",
        _route_after_agent,
        {"execute_tools": "execute_tools", "extract_response": "extract_response"},
    )
    builder.add_conditional_edges(
        "execute_tools",
        _route_after_tools,
        {"agent": "agent", "extract_response": "extract_response"},
    )
    builder.add_edge("extract_response", END)

    compiled = builder.compile()
    logger.info("Game Master LangGraph agent compiled")
    return compiled


def stream_gm_agent(initial_state: GMAgentState) -> Generator[dict, None, None]:
    """Run the GM agent and yield AG-UI events as they are emitted by nodes.

    Nodes call `get_stream_writer()` which, under `stream_mode="custom"`,
    routes each AG-UI event dict to this generator.
    """
    agent = build_gm_agent()
    for chunk in agent.stream(initial_state, stream_mode="custom"):
        if isinstance(chunk, dict):
            yield chunk
