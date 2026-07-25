"""
AutoOps AI — Multi-Agent Workflow Automation System
Converts unstructured meeting transcripts into structured, trackable action items.

Pipeline: ingest -> extract -> assign -> monitor -> escalate
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from enum import Enum
import uuid
import os
from datetime import datetime, timedelta

from agents.ingest_agent import IngestAgent
from agents.extract_agent import ExtractAgent
from agents.assign_agent import AssignAgent
from agents.monitor_agent import MonitorAgent
from agents.escalate_agent import EscalateAgent
from agents.validate_agent import ValidateAgent
from agents.retry_agent import RetryAgent

app = FastAPI(
    title="AutoOps AI",
    description="Multi-agent pipeline that converts meeting transcripts into structured, trackable action items.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory store for demo purposes. Swap for Postgres/Redis in production.
TASKS_DB = {}
RUNS_DB = {}


class TaskStatus(str, Enum):
    PENDING = "pending"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    ESCALATED = "escalated"
    COMPLETED = "completed"
    FAILED = "failed"


class TranscriptRequest(BaseModel):
    transcript: str
    meeting_title: Optional[str] = "Untitled Meeting"
    participants: Optional[List[str]] = []


class ActionItem(BaseModel):
    id: str
    description: str
    owner: Optional[str]
    due_date: Optional[str]
    priority: str
    status: TaskStatus
    retry_count: int = 0
    confidence_score: float = 0.0


class PipelineRunResponse(BaseModel):
    run_id: str
    meeting_title: str
    action_items: List[ActionItem]
    agents_executed: List[str]
    total_items_extracted: int
    items_escalated: int
    processing_time_ms: float


# Instantiate the agent chain once at startup
ingest_agent = IngestAgent()
extract_agent = ExtractAgent()
validate_agent = ValidateAgent()
assign_agent = AssignAgent()
monitor_agent = MonitorAgent()
escalate_agent = EscalateAgent()
retry_agent = RetryAgent(max_retries=3)


@app.get("/")
def root():
    return {
        "service": "AutoOps AI",
        "status": "running",
        "pipeline": ["ingest", "extract", "validate", "assign", "monitor", "escalate"],
    }


@app.post("/pipeline/run", response_model=PipelineRunResponse)
async def run_pipeline(request: TranscriptRequest):
    """
    Runs the full 7-agent pipeline on a raw meeting transcript and
    returns structured, assigned, trackable action items.
    """
    start_time = datetime.utcnow()
    run_id = str(uuid.uuid4())
    agents_executed = []

    try:
        # Stage 1: Ingest — clean and chunk the raw transcript
        cleaned_text = ingest_agent.run(request.transcript)
        agents_executed.append("ingest")

        # Stage 2: Extract — pull candidate action items via LLM
        raw_items = extract_agent.run(cleaned_text, participants=request.participants)
        agents_executed.append("extract")

        # Stage 3: Validate — score confidence, drop low-quality extractions
        validated_items, low_confidence_items = validate_agent.run(raw_items)
        agents_executed.append("validate")

        # Stage 3b: Retry — re-run extraction on anything that failed validation
        if low_confidence_items:
            retried_items = retry_agent.run(
                low_confidence_items, extract_agent=extract_agent, cleaned_text=cleaned_text
            )
            validated_items.extend(retried_items)
            agents_executed.append("retry")

        # Stage 4: Assign — match each action item to an owner
        assigned_items = assign_agent.run(validated_items, participants=request.participants)
        agents_executed.append("assign")

        # Stage 5: Monitor — set due dates and tracking state
        monitored_items = monitor_agent.run(assigned_items)
        agents_executed.append("monitor")

        # Stage 6: Escalate — flag overdue / unowned / high-priority items
        final_items, escalated_count = escalate_agent.run(monitored_items)
        agents_executed.append("escalate")

        # Persist to in-memory store
        action_items = []
        for item in final_items:
            task_id = str(uuid.uuid4())
            task = ActionItem(
                id=task_id,
                description=item["description"],
                owner=item.get("owner"),
                due_date=item.get("due_date"),
                priority=item.get("priority", "medium"),
                status=TaskStatus(item.get("status", "pending")),
                retry_count=item.get("retry_count", 0),
                confidence_score=item.get("confidence_score", 0.0),
            )
            TASKS_DB[task_id] = task
            action_items.append(task)

        elapsed_ms = (datetime.utcnow() - start_time).total_seconds() * 1000

        run_record = PipelineRunResponse(
            run_id=run_id,
            meeting_title=request.meeting_title,
            action_items=action_items,
            agents_executed=agents_executed,
            total_items_extracted=len(raw_items),
            items_escalated=escalated_count,
            processing_time_ms=round(elapsed_ms, 2),
        )
        RUNS_DB[run_id] = run_record
        return run_record

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pipeline failed at stage '{agents_executed[-1] if agents_executed else 'ingest'}': {str(e)}")


@app.get("/tasks", response_model=List[ActionItem])
def list_tasks(status: Optional[TaskStatus] = None):
    """List all tracked action items, optionally filtered by status."""
    items = list(TASKS_DB.values())
    if status:
        items = [i for i in items if i.status == status]
    return items


@app.get("/tasks/{task_id}", response_model=ActionItem)
def get_task(task_id: str):
    if task_id not in TASKS_DB:
        raise HTTPException(status_code=404, detail="Task not found")
    return TASKS_DB[task_id]


@app.patch("/tasks/{task_id}/status")
def update_task_status(task_id: str, status: TaskStatus):
    if task_id not in TASKS_DB:
        raise HTTPException(status_code=404, detail="Task not found")
    TASKS_DB[task_id].status = status
    return {"task_id": task_id, "new_status": status}


@app.get("/runs/{run_id}", response_model=PipelineRunResponse)
def get_run(run_id: str):
    if run_id not in RUNS_DB:
        raise HTTPException(status_code=404, detail="Run not found")
    return RUNS_DB[run_id]


@app.get("/health")
def health_check():
    return {"status": "ok", "tasks_tracked": len(TASKS_DB), "runs_completed": len(RUNS_DB)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
