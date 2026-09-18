import json
import logging
from typing import List, Optional

from datetime import datetime, date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.generation_history import Generation_historyService

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/entities/generation_history", tags=["generation_history"])


# ---------- Pydantic Schemas ----------
class Generation_historyData(BaseModel):
    """Entity data schema (for create/update)"""
    description: str
    template_name: str = None
    app_title: str = None
    category: str = None
    kind: str = None
    html_code: str = None
    plan_summary: str = None
    model: str = None
    version: int = None
    instruction: str = None


class Generation_historyUpdateData(BaseModel):
    """Update entity data (partial updates allowed)"""
    description: Optional[str] = None
    template_name: Optional[str] = None
    app_title: Optional[str] = None
    category: Optional[str] = None
    kind: Optional[str] = None
    html_code: Optional[str] = None
    plan_summary: Optional[str] = None
    model: Optional[str] = None
    version: Optional[int] = None
    instruction: Optional[str] = None


class Generation_historyResponse(BaseModel):
    """Entity response schema"""
    id: int
    description: str
    template_name: Optional[str] = None
    app_title: Optional[str] = None
    category: Optional[str] = None
    kind: Optional[str] = None
    html_code: Optional[str] = None
    plan_summary: Optional[str] = None
    model: Optional[str] = None
    version: Optional[int] = None
    instruction: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class Generation_historyListResponse(BaseModel):
    """List response schema"""
    items: List[Generation_historyResponse]
    total: int
    skip: int
    limit: int


class Generation_historyBatchCreateRequest(BaseModel):
    """Batch create request"""
    items: List[Generation_historyData]


class Generation_historyBatchUpdateItem(BaseModel):
    """Batch update item"""
    id: int
    updates: Generation_historyUpdateData


class Generation_historyBatchUpdateRequest(BaseModel):
    """Batch update request"""
    items: List[Generation_historyBatchUpdateItem]


class Generation_historyBatchDeleteRequest(BaseModel):
    """Batch delete request"""
    ids: List[int]


# ---------- Routes ----------
@router.get("", response_model=Generation_historyListResponse)
async def query_generation_historys(
    query: str = Query(None, description='Query conditions as JSON, e.g. {"id":2} or {"id":{"$gte":2}}'),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Query generation_historys with filtering, sorting, and pagination"""
    logger.debug(f"Querying generation_historys: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")
    
    service = Generation_historyService(db)
    try:
        # Parse query JSON if provided
        query_dict = None
        if query:
            try:
                query_dict = json.loads(query)
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Invalid query JSON format")
        
        result = await service.get_list(
            skip=skip, 
            limit=limit,
            query_dict=query_dict,
            sort=sort,
        )
        logger.debug(f"Found {result['total']} generation_historys")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid generation_history query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying generation_historys: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/all", response_model=Generation_historyListResponse)
async def query_generation_historys_all(
    query: str = Query(None, description='Query conditions as JSON, e.g. {"id":2} or {"id":{"$gte":2}}'),
    sort: str = Query(None, description="Sort field (prefix with '-' for descending)"),
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(20, ge=1, le=2000, description="Max number of records to return"),
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    # Query generation_historys with filtering, sorting, and pagination without user limitation
    logger.debug(f"Querying generation_historys: query={query}, sort={sort}, skip={skip}, limit={limit}, fields={fields}")

    service = Generation_historyService(db)
    try:
        # Parse query JSON if provided
        query_dict = None
        if query:
            try:
                query_dict = json.loads(query)
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Invalid query JSON format")

        result = await service.get_list(
            skip=skip,
            limit=limit,
            query_dict=query_dict,
            sort=sort
        )
        logger.debug(f"Found {result['total']} generation_historys")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Invalid generation_history query: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error querying generation_historys: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{id}", response_model=Generation_historyResponse)
async def get_generation_history(
    id: int,
    fields: str = Query(None, description="Comma-separated list of fields to return"),
    db: AsyncSession = Depends(get_db),
):
    """Get a single generation_history by ID"""
    logger.debug(f"Fetching generation_history with id: {id}, fields={fields}")
    
    service = Generation_historyService(db)
    try:
        result = await service.get_by_id(id)
        if not result:
            logger.warning(f"Generation_history with id {id} not found")
            raise HTTPException(status_code=404, detail="Generation_history not found")
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching generation_history {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("", response_model=Generation_historyResponse, status_code=201)
async def create_generation_history(
    data: Generation_historyData,
    db: AsyncSession = Depends(get_db),
):
    """Create a new generation_history"""
    logger.debug(f"Creating new generation_history with data: {data}")
    
    service = Generation_historyService(db)
    try:
        result = await service.create(data.model_dump())
        if not result:
            raise HTTPException(status_code=400, detail="Failed to create generation_history")
        
        logger.info(f"Generation_history created successfully with id: {result.id}")
        return result
    except ValueError as e:
        logger.error(f"Validation error creating generation_history: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating generation_history: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/batch", response_model=List[Generation_historyResponse], status_code=201)
async def create_generation_historys_batch(
    request: Generation_historyBatchCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create multiple generation_historys in a single request"""
    logger.debug(f"Batch creating {len(request.items)} generation_historys")
    
    service = Generation_historyService(db)
    results = []
    
    try:
        for item_data in request.items:
            result = await service.create(item_data.model_dump())
            if result:
                results.append(result)
        
        logger.info(f"Batch created {len(results)} generation_historys successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch create: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch create failed: {str(e)}")


@router.put("/batch", response_model=List[Generation_historyResponse])
async def update_generation_historys_batch(
    request: Generation_historyBatchUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Update multiple generation_historys in a single request"""
    logger.debug(f"Batch updating {len(request.items)} generation_historys")
    
    service = Generation_historyService(db)
    results = []
    
    try:
        for item in request.items:
            # Only include non-None values for partial updates
            update_dict = {k: v for k, v in item.updates.model_dump().items() if v is not None}
            result = await service.update(item.id, update_dict)
            if result:
                results.append(result)
        
        logger.info(f"Batch updated {len(results)} generation_historys successfully")
        return results
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch update failed: {str(e)}")


@router.put("/{id}", response_model=Generation_historyResponse)
async def update_generation_history(
    id: int,
    data: Generation_historyUpdateData,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing generation_history"""
    logger.debug(f"Updating generation_history {id} with data: {data}")

    service = Generation_historyService(db)
    try:
        # Only include non-None values for partial updates
        update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
        result = await service.update(id, update_dict)
        if not result:
            logger.warning(f"Generation_history with id {id} not found for update")
            raise HTTPException(status_code=404, detail="Generation_history not found")
        
        logger.info(f"Generation_history {id} updated successfully")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error updating generation_history {id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating generation_history {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.delete("/batch")
async def delete_generation_historys_batch(
    request: Generation_historyBatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple generation_historys by their IDs"""
    logger.debug(f"Batch deleting {len(request.ids)} generation_historys")
    
    service = Generation_historyService(db)
    deleted_count = 0
    
    try:
        for item_id in request.ids:
            success = await service.delete(item_id)
            if success:
                deleted_count += 1
        
        logger.info(f"Batch deleted {deleted_count} generation_historys successfully")
        return {"message": f"Successfully deleted {deleted_count} generation_historys", "deleted_count": deleted_count}
    except Exception as e:
        await db.rollback()
        logger.error(f"Error in batch delete: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch delete failed: {str(e)}")


@router.delete("/{id}")
async def delete_generation_history(
    id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single generation_history by ID"""
    logger.debug(f"Deleting generation_history with id: {id}")
    
    service = Generation_historyService(db)
    try:
        success = await service.delete(id)
        if not success:
            logger.warning(f"Generation_history with id {id} not found for deletion")
            raise HTTPException(status_code=404, detail="Generation_history not found")
        
        logger.info(f"Generation_history {id} deleted successfully")
        return {"message": "Generation_history deleted successfully", "id": id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting generation_history {id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")