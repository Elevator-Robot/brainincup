"""Brain's bounded cognitive turn: shared by invoke and AG-UI streaming.

load → recall → appraise → (respond/recollect/reflect/clarify intention)
     → one model response → consolidate → publish
Recent receipts can go directly to publish. There are no recursive thought loops.
"""
from langgraph.graph import END, StateGraph
from .state import BrainTurn
from .nodes import load_node, recall_node, appraise_node, intention_node, respond_node, integrate_node, publish_node


def build_agent():
    builder = StateGraph(BrainTurn)
    for name, node in {
        "load_state": load_node, "recall": recall_node, "appraise": appraise_node,
        "respond_intention": intention_node, "recollect_intention": intention_node,
        "reflect_intention": intention_node, "clarify_intention": intention_node,
        "respond": respond_node, "consolidate": integrate_node, "publish": publish_node,
    }.items():
        builder.add_node(name, node)
    builder.set_entry_point("load_state")
    builder.add_conditional_edges("load_state", lambda state: "publish" if state["replayed"] else "recall", {"publish": "publish", "recall": "recall"})
    builder.add_conditional_edges("recall", lambda state: "publish" if state["replayed"] else "appraise", {"publish": "publish", "appraise": "appraise"})
    routes = {name: f"{name}_intention" for name in ("respond", "recollect", "reflect", "clarify")}
    builder.add_conditional_edges("appraise", lambda state: state["intention"], routes)
    for name in routes.values():
        builder.add_edge(name, "respond")
    builder.add_edge("respond", "consolidate")
    builder.add_edge("consolidate", "publish")
    builder.add_edge("publish", END)
    return builder.compile()
