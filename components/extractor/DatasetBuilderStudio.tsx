import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  createDatasetDefinition,
  createDatasetEdge,
  createDatasetNode,
  createDatasetSelectedColumn,
  deleteDatasetEdge,
  deleteDatasetNode,
  deleteDatasetSelectedColumn,
  listDatasetDefinitions,
  listDatasetEdges,
  listDatasetNodes,
  listDatasetSelectedColumns,
  listSourceDatasets,
  previewDatasetDefinition,
  publishDatasetDefinition,
  updateDatasetEdge,
  updateDatasetNode,
} from '../../services/datasetBuilderService';
import { DatasetDefinition, DatasetEdge, DatasetNode, DatasetPreviewResponse, DatasetSelectedColumn, SourceDataset } from '../../types';
import { Eye, GitBranch, Layers3, PlayCircle, Plus, Table2, Trash2 } from 'lucide-react';

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'dataset';

const NODE_CARD_WIDTH = 260;
const NODE_CARD_HEIGHT = 132;
const CANVAS_WIDTH = 1360;
const CANVAS_HEIGHT = 720;
const JOIN_FIELD_SYNONYMS: Record<string, string[]> = {
  date: ['data', 'day', 'event_date'],
  data: ['date', 'day', 'event_date'],
  campaign_name: ['campaign', 'utm_campaign', 'nome_da_campanha'],
  campaign: ['campaign_name', 'utm_campaign', 'nome_da_campanha'],
  campaign_id: ['campaignid', 'id_campaign', 'id_campanha'],
  adset_name: ['ad_set_name', 'adgroup_name', 'conjunto'],
  adset_id: ['ad_set_id', 'adgroup_id', 'conjunto_id'],
  source: ['origem'],
  medium: ['midia'],
};

const normalizeJoinFieldName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const ensureArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

export const DatasetBuilderStudio: React.FC = () => {
  const [datasetDefinitions, setDatasetDefinitions] = useState<DatasetDefinition[]>([]);
  const [sourceDatasets, setSourceDatasets] = useState<SourceDataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<number | null>(null);
  const [nodes, setNodes] = useState<DatasetNode[]>([]);
  const [edges, setEdges] = useState<DatasetEdge[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<DatasetSelectedColumn[]>([]);
  const [preview, setPreview] = useState<DatasetPreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<number | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<number | null>(null);
  const [selectedNodeLabelDraft, setSelectedNodeLabelDraft] = useState('');
  const [connectionSourceNodeId, setConnectionSourceNodeId] = useState<number | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<number | null>(null);
  const [nodePositions, setNodePositions] = useState<Record<number, { x: number; y: number }>>({});
  const dragStateRef = useRef<{
    nodeId: number;
    pointerOffsetX: number;
    pointerOffsetY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  const [newDatasetName, setNewDatasetName] = useState('');
  const [newNodeSourceId, setNewNodeSourceId] = useState('');
  const [newNodeLabel, setNewNodeLabel] = useState('');
  const [newEdge, setNewEdge] = useState({
    from_node_id: '',
    to_node_id: '',
    join_type: 'left' as const,
    from_field: '',
    to_field: '',
  });
  const [newColumn, setNewColumn] = useState({
    node_id: '',
    source_column: '',
    output_column: '',
    semantic_type: '',
    aggregation_type: 'none',
    is_dimension: true,
    is_metric: false,
  });
  const safeDatasetDefinitions = ensureArray<DatasetDefinition>(datasetDefinitions);
  const safeSourceDatasets = ensureArray<SourceDataset>(sourceDatasets);
  const safeNodes = ensureArray<DatasetNode>(nodes);
  const safeEdges = ensureArray<DatasetEdge>(edges);
  const safeSelectedColumns = ensureArray<DatasetSelectedColumn>(selectedColumns);

  const selectedDataset = useMemo(
    () => safeDatasetDefinitions.find((item) => item.id === selectedDatasetId) ?? null,
    [safeDatasetDefinitions, selectedDatasetId]
  );

  const sourceMap = useMemo(
    () => Object.fromEntries(safeSourceDatasets.map((item) => [item.id, item])),
    [safeSourceDatasets]
  );

  const nodeMap = useMemo(
    () => Object.fromEntries(safeNodes.map((item) => [item.id, item])),
    [safeNodes]
  );

  const nodeFieldOptions = useMemo(() => {
    const map: Record<number, Array<{ name: string; type?: string }>> = {};
    for (const node of safeNodes) {
      const source = sourceMap[node.source_dataset_id ?? 0];
      const catalog = Array.isArray(source?.field_catalog_json) ? source.field_catalog_json : [];
      map[node.id] = catalog
        .filter((field): field is { name: string; type?: string } => typeof field === 'object' && !!field && 'name' in field)
        .map((field) => ({
          name: String(field.name),
          type: typeof field.type === 'string' ? field.type : undefined,
        }));
    }
    return map;
  }, [safeNodes, sourceMap]);

  const visualNodes = useMemo(() => {
    return safeNodes.map((node, index) => {
      const source = sourceMap[node.source_dataset_id ?? 0];
      const fallbackX = 60 + (index % 4) * 300;
      const fallbackY = 80 + Math.floor(index / 4) * 220;
      const overridden = nodePositions[node.id];

      return {
        ...node,
        source,
        pos_x: overridden?.x ?? (Number.isFinite(node.pos_x) ? node.pos_x : fallbackX),
        pos_y: overridden?.y ?? (Number.isFinite(node.pos_y) ? node.pos_y : fallbackY),
      };
    });
  }, [safeNodes, sourceMap, nodePositions]);
  const connectionSourceNode = useMemo(
    () => visualNodes.find((node) => node.id === connectionSourceNodeId) ?? null,
    [visualNodes, connectionSourceNodeId]
  );

  const visualEdges = useMemo(() => {
    return safeEdges
      .map((edge) => {
        const fromNode = nodeMap[edge.from_node_id];
        const toNode = nodeMap[edge.to_node_id];
        if (!fromNode || !toNode) {
          return null;
        }

        const x1 = fromNode.pos_x + NODE_CARD_WIDTH;
        const y1 = fromNode.pos_y + NODE_CARD_HEIGHT / 2;
        const x2 = toNode.pos_x;
        const y2 = toNode.pos_y + NODE_CARD_HEIGHT / 2;
        const delta = Math.max(60, Math.abs(x2 - x1) / 2);
        const path = `M ${x1} ${y1} C ${x1 + delta} ${y1}, ${x2 - delta} ${y2}, ${x2} ${y2}`;

        return { ...edge, path, labelX: (x1 + x2) / 2, labelY: (y1 + y2) / 2 - 10 };
      })
      .filter(Boolean) as Array<DatasetEdge & { path: string; labelX: number; labelY: number }>;
  }, [safeEdges, nodeMap]);

  const selectedNode = useMemo(
    () => visualNodes.find((node) => node.id === selectedNodeId) ?? null,
    [visualNodes, selectedNodeId]
  );
  const selectedEdge = useMemo(
    () => safeEdges.find((edge) => edge.id === selectedEdgeId) ?? null,
    [safeEdges, selectedEdgeId]
  );
  const selectedNodeColumns = useMemo(
    () => safeSelectedColumns.filter((column) => column.node_id === selectedNodeId),
    [safeSelectedColumns, selectedNodeId]
  );
  const selectedNodeEdges = useMemo(
    () => safeEdges.filter((edge) => edge.from_node_id === selectedNodeId || edge.to_node_id === selectedNodeId),
    [safeEdges, selectedNodeId]
  );
  const availableTargetNodes = useMemo(
    () => safeNodes.filter((node) => node.id !== Number(newEdge.from_node_id || 0)),
    [safeNodes, newEdge.from_node_id]
  );
  const compatibleTargetFields = useMemo(() => {
    const fromFields = nodeFieldOptions[Number(newEdge.from_node_id)] ?? [];
    const toFields = nodeFieldOptions[Number(newEdge.to_node_id)] ?? [];
    if (!newEdge.from_field) {
      return toFields;
    }

    const sourceField = fromFields.find((field) => field.name === newEdge.from_field);
    if (!sourceField?.type) {
      return toFields;
    }

    const compatible = toFields.filter((field) => field.type === sourceField.type);
    return compatible.length > 0 ? compatible : toFields;
  }, [newEdge.from_field, newEdge.from_node_id, newEdge.to_node_id, nodeFieldOptions]);
  const suggestedJoinFields = useMemo(() => {
    const fromFields = nodeFieldOptions[Number(newEdge.from_node_id)] ?? [];
    const toFields = nodeFieldOptions[Number(newEdge.to_node_id)] ?? [];
    if (!fromFields.length || !toFields.length) {
      return null;
    }

    const toFieldMap = new Map(
      toFields.map((field) => [normalizeJoinFieldName(field.name), field])
    );

    for (const fromField of fromFields) {
      const normalizedFrom = normalizeJoinFieldName(fromField.name);
      const directMatch = toFieldMap.get(normalizedFrom);
      if (directMatch && (!fromField.type || !directMatch.type || fromField.type === directMatch.type)) {
        return { from: fromField.name, to: directMatch.name };
      }

      const synonyms = JOIN_FIELD_SYNONYMS[normalizedFrom] ?? [];
      for (const synonym of synonyms) {
        const synonymMatch = toFieldMap.get(synonym);
        if (synonymMatch && (!fromField.type || !synonymMatch.type || fromField.type === synonymMatch.type)) {
          return { from: fromField.name, to: synonymMatch.name };
        }
      }
    }

    for (const fromField of fromFields) {
      if (fromField.type !== 'date' && fromField.type !== 'datetime') {
        continue;
      }
      const candidate = toFields.find((field) => field.type === fromField.type || field.type === 'date' || field.type === 'datetime');
      if (candidate) {
        return { from: fromField.name, to: candidate.name };
      }
    }

    return null;
  }, [newEdge.from_node_id, newEdge.to_node_id, nodeFieldOptions]);
  const temporaryConnectionPath = useMemo(() => {
    if (!connectionSourceNode || !hoveredNodeId || hoveredNodeId === connectionSourceNode.id) {
      return null;
    }

    const targetNode = visualNodes.find((node) => node.id === hoveredNodeId);
    if (!targetNode) {
      return null;
    }

    const x1 = connectionSourceNode.pos_x + NODE_CARD_WIDTH;
    const y1 = connectionSourceNode.pos_y + NODE_CARD_HEIGHT / 2;
    const x2 = targetNode.pos_x;
    const y2 = targetNode.pos_y + NODE_CARD_HEIGHT / 2;
    const delta = Math.max(60, Math.abs(x2 - x1) / 2);
    return `M ${x1} ${y1} C ${x1 + delta} ${y1}, ${x2 - delta} ${y2}, ${x2} ${y2}`;
  }, [connectionSourceNode, hoveredNodeId, visualNodes]);

  const refreshDefinitions = async () => {
    const items = await listDatasetDefinitions();
    setDatasetDefinitions(Array.isArray(items) ? items : []);
    const safeItems = ensureArray<DatasetDefinition>(items);
    if (!selectedDatasetId && safeItems[0]) {
      setSelectedDatasetId(safeItems[0].id);
    }
  };

  const refreshSources = async () => {
    const items = await listSourceDatasets();
    setSourceDatasets(Array.isArray(items) ? items : []);
  };

  const refreshDatasetDetails = async (datasetId: number) => {
    const [nodeItems, edgeItems, columnItems] = await Promise.all([
      listDatasetNodes(datasetId),
      listDatasetEdges(datasetId),
      listDatasetSelectedColumns(datasetId),
    ]);
    setNodes(Array.isArray(nodeItems) ? nodeItems : []);
    setEdges(Array.isArray(edgeItems) ? edgeItems : []);
    setSelectedColumns(Array.isArray(columnItems) ? columnItems : []);
  };

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([refreshDefinitions(), refreshSources()])
      .catch((err) => {
        console.error(err);
        setError(err instanceof Error ? err.message : 'Não foi possível carregar o construtor.');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedDatasetId) {
      setNodes([]);
      setEdges([]);
      setSelectedColumns([]);
      setPreview(null);
      setNodePositions({});
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setConnectionSourceNodeId(null);
      setHoveredNodeId(null);
      return;
    }

    setLoading(true);
    setError(null);
    setNodes([]);
    setEdges([]);
    setSelectedColumns([]);
    setPreview(null);
    refreshDatasetDetails(selectedDatasetId)
      .catch((err) => {
        console.error(err);
        setError(err instanceof Error ? err.message : 'Não foi possível carregar os detalhes da base.');
      })
      .finally(() => setLoading(false));
  }, [selectedDatasetId]);

  useEffect(() => {
    const nextPositions: Record<number, { x: number; y: number }> = {};
    safeNodes.forEach((node, index) => {
      const fallbackX = 60 + (index % 4) * 300;
      const fallbackY = 80 + Math.floor(index / 4) * 220;
      nextPositions[node.id] = {
        x: Number.isFinite(node.pos_x) ? node.pos_x : fallbackX,
        y: Number.isFinite(node.pos_y) ? node.pos_y : fallbackY,
      };
    });
    setNodePositions(nextPositions);
  }, [safeNodes]);

  useEffect(() => {
    if (selectedNode) {
      setSelectedNodeLabelDraft(selectedNode.label);
    } else {
      setSelectedNodeLabelDraft('');
    }
  }, [selectedNode]);

  useEffect(() => {
    if (!suggestedJoinFields) {
      return;
    }

    setNewEdge((prev) => {
      if (!prev.from_node_id || !prev.to_node_id) {
        return prev;
      }

      const next = { ...prev };
      let changed = false;

      if (!prev.from_field) {
        next.from_field = suggestedJoinFields.from;
        changed = true;
      }

      if (!prev.to_field) {
        next.to_field = suggestedJoinFields.to;
        changed = true;
      }

      return changed ? next : prev;
    });
  }, [suggestedJoinFields]);

  const handleCreateDataset = async () => {
    if (!newDatasetName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const created = await createDatasetDefinition({
        name: newDatasetName.trim(),
        slug: slugify(newDatasetName),
        status: 'draft',
        warehouse_schema: 'derived',
        warehouse_table: `ds_${slugify(newDatasetName)}`,
      });
      setNewDatasetName('');
      await refreshDefinitions();
      setSelectedDatasetId(created.id);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Não foi possível criar a base derivada.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNode = async () => {
    if (!selectedDatasetId || !newNodeSourceId || !newNodeLabel.trim()) return;
    const nextIndex = safeNodes.length;
    const posX = 60 + (nextIndex % 4) * 300;
    const posY = 80 + Math.floor(nextIndex / 4) * 220;

    setLoading(true);
    setError(null);
    try {
      await createDatasetNode(selectedDatasetId, {
        label: newNodeLabel.trim(),
        source_dataset_id: Number(newNodeSourceId),
        node_type: 'source',
        pos_x: posX,
        pos_y: posY,
      });
      setNewNodeLabel('');
      setNewNodeSourceId('');
      await refreshDatasetDetails(selectedDatasetId);
      setSelectedNodeId(null);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Não foi possível criar o node.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateEdge = async () => {
    if (!selectedDatasetId || !newEdge.from_node_id || !newEdge.to_node_id || !newEdge.from_field || !newEdge.to_field) return;
    setLoading(true);
    setError(null);
    try {
      await createDatasetEdge(selectedDatasetId, {
        from_node_id: Number(newEdge.from_node_id),
        to_node_id: Number(newEdge.to_node_id),
        join_type: newEdge.join_type,
        from_field: newEdge.from_field,
        to_field: newEdge.to_field,
      });
      setNewEdge({
        from_node_id: '',
        to_node_id: '',
        join_type: 'left',
        from_field: '',
        to_field: '',
      });
      setSelectedEdgeId(null);
      setConnectionSourceNodeId(null);
      setHoveredNodeId(null);
      await refreshDatasetDetails(selectedDatasetId);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Não foi possível criar o join.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEdge = async () => {
    if (!selectedDatasetId || !selectedEdgeId || !newEdge.from_node_id || !newEdge.to_node_id || !newEdge.from_field || !newEdge.to_field) return;
    setLoading(true);
    setError(null);
    try {
      await updateDatasetEdge(selectedDatasetId, selectedEdgeId, {
        from_node_id: Number(newEdge.from_node_id),
        to_node_id: Number(newEdge.to_node_id),
        join_type: newEdge.join_type,
        from_field: newEdge.from_field,
        to_field: newEdge.to_field,
      });
      await refreshDatasetDetails(selectedDatasetId);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Não foi possível atualizar o join.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteEdge = async (edgeId: number) => {
    if (!selectedDatasetId) return;
    setLoading(true);
    setError(null);
    try {
      await deleteDatasetEdge(selectedDatasetId, edgeId);
      if (selectedEdgeId === edgeId) {
        setSelectedEdgeId(null);
        setNewEdge({
          from_node_id: '',
          to_node_id: '',
          join_type: 'left',
          from_field: '',
          to_field: '',
        });
      }
      await refreshDatasetDetails(selectedDatasetId);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Não foi possível remover o join.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateColumn = async () => {
    if (!selectedDatasetId || !newColumn.node_id || !newColumn.source_column || !newColumn.output_column) return;
    setLoading(true);
    setError(null);
    try {
      await createDatasetSelectedColumn(selectedDatasetId, {
        node_id: Number(newColumn.node_id),
        source_column: newColumn.source_column,
        output_column: newColumn.output_column,
        semantic_type: newColumn.semantic_type || null,
        aggregation_type: newColumn.aggregation_type as DatasetSelectedColumn['aggregation_type'],
        is_dimension: newColumn.is_dimension,
        is_metric: newColumn.is_metric,
      });
      setNewColumn({
        node_id: '',
        source_column: '',
        output_column: '',
        semantic_type: '',
        aggregation_type: 'none',
        is_dimension: true,
        is_metric: false,
      });
      await refreshDatasetDetails(selectedDatasetId);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Não foi possível adicionar a coluna.');
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = async () => {
    if (!selectedDatasetId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await previewDatasetDefinition(selectedDatasetId, 20);
      setPreview(data);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Não foi possível gerar o preview.');
    } finally {
      setLoading(false);
    }
  };

  const handlePublish = async () => {
    if (!selectedDatasetId) return;
    setLoading(true);
    setError(null);
    try {
      await publishDatasetDefinition(selectedDatasetId);
      await refreshDefinitions();
      await handlePreview();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Não foi possível publicar a base.');
    } finally {
      setLoading(false);
    }
  };

  const persistNodePosition = async (nodeId: number, x: number, y: number) => {
    if (!selectedDatasetId) return;
    try {
      await updateDatasetNode(selectedDatasetId, nodeId, { pos_x: x, pos_y: y });
      setNodes((prev) =>
        prev.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                pos_x: x,
                pos_y: y,
              }
            : node
        )
      );
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Não foi possível salvar a posição do node.');
    }
  };

  const handleSaveSelectedNode = async () => {
    if (!selectedDatasetId || !selectedNode || !selectedNodeLabelDraft.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await updateDatasetNode(selectedDatasetId, selectedNode.id, {
        label: selectedNodeLabelDraft.trim(),
      });
      await refreshDatasetDetails(selectedDatasetId);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Não foi possível atualizar o node.');
    } finally {
      setLoading(false);
    }
  };

  const handleNodePointerDown = (event: React.PointerEvent<HTMLDivElement>, nodeId: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const nodePosition = nodePositions[nodeId];
    if (!nodePosition) return;

    const canvasRect = canvas.getBoundingClientRect();
    dragStateRef.current = {
      nodeId,
      pointerOffsetX: event.clientX - canvasRect.left - nodePosition.x,
      pointerOffsetY: event.clientY - canvasRect.top - nodePosition.y,
      originX: event.clientX,
      originY: event.clientY,
      moved: false,
    };
    setSelectedNodeId(nodeId);
    setNewColumn((prev) => ({ ...prev, node_id: String(nodeId) }));
    setNewEdge((prev) => ({ ...prev, from_node_id: prev.from_node_id || String(nodeId) }));
    setDraggingNodeId(nodeId);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleCanvasPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    const canvas = canvasRef.current;
    if (!dragState || !canvas) return;

    const canvasRect = canvas.getBoundingClientRect();
    const maxX = CANVAS_WIDTH - NODE_CARD_WIDTH - 20;
    const maxY = CANVAS_HEIGHT - NODE_CARD_HEIGHT - 20;
    const nextX = Math.min(maxX, Math.max(20, event.clientX - canvasRect.left - dragState.pointerOffsetX));
    const nextY = Math.min(maxY, Math.max(20, event.clientY - canvasRect.top - dragState.pointerOffsetY));
    if (!dragState.moved) {
      const deltaX = Math.abs(event.clientX - dragState.originX);
      const deltaY = Math.abs(event.clientY - dragState.originY);
      if (deltaX > 4 || deltaY > 4) {
        dragState.moved = true;
      }
    }

    setNodePositions((prev) => ({
      ...prev,
      [dragState.nodeId]: { x: nextX, y: nextY },
    }));
  };

  const handleCanvasPointerUp = async () => {
    const dragState = dragStateRef.current;
    if (!dragState) return;

    const position = nodePositions[dragState.nodeId];
    dragStateRef.current = null;
    setDraggingNodeId(null);

    if (position) {
      await persistNodePosition(dragState.nodeId, position.x, position.y);
    }
  };

  const handleStartConnection = () => {
    if (!selectedNode) return;
    setSelectedEdgeId(null);
    setConnectionSourceNodeId(selectedNode.id);
    setHoveredNodeId(null);
    setNewEdge({
      from_node_id: String(selectedNode.id),
      to_node_id: '',
      join_type: 'left',
      from_field: '',
      to_field: '',
    });
  };

  const handleStartConnectionFromNode = (nodeId: number) => {
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    setConnectionSourceNodeId(nodeId);
    setHoveredNodeId(null);
    setNewEdge({
      from_node_id: String(nodeId),
      to_node_id: '',
      join_type: 'left',
      from_field: '',
      to_field: '',
    });
  };

  const handleCancelConnection = () => {
    setSelectedEdgeId(null);
    setConnectionSourceNodeId(null);
    setHoveredNodeId(null);
    setNewEdge({
      from_node_id: '',
      to_node_id: '',
      join_type: 'left',
      from_field: '',
      to_field: '',
    });
  };

  const handleNodeClick = (nodeId: number) => {
    const dragState = dragStateRef.current;
    if (dragState?.nodeId === nodeId && dragState.moved) {
      return;
    }

    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    setNewColumn((prev) => ({ ...prev, node_id: String(nodeId) }));

    if (connectionSourceNodeId && connectionSourceNodeId !== nodeId) {
      setNewEdge((prev) => ({
        ...prev,
        from_node_id: String(connectionSourceNodeId),
        to_node_id: String(nodeId),
        from_field: '',
        to_field: '',
      }));
      setHoveredNodeId(nodeId);
      return;
    }

    setNewEdge((prev) => ({ ...prev, from_node_id: prev.from_node_id || String(nodeId) }));
  };

  const handleTargetHandleClick = (nodeId: number) => {
    if (!connectionSourceNodeId || connectionSourceNodeId === nodeId) {
      handleNodeClick(nodeId);
      return;
    }

    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    setHoveredNodeId(nodeId);
    setNewEdge((prev) => ({
      ...prev,
      from_node_id: String(connectionSourceNodeId),
      to_node_id: String(nodeId),
      from_field: '',
      to_field: '',
    }));
  };

  const handleSelectEdge = (edge: DatasetEdge) => {
    setSelectedEdgeId(edge.id);
    setSelectedNodeId(null);
    setConnectionSourceNodeId(null);
    setHoveredNodeId(null);
    setNewEdge({
      from_node_id: String(edge.from_node_id),
      to_node_id: String(edge.to_node_id),
      join_type: edge.join_type,
      from_field: edge.from_field,
      to_field: edge.to_field,
    });
  };

  return (
    <div className="min-h-screen px-8 py-10">
      <div className="max-w-[1680px]">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-xs font-semibold text-[#5B4DFF]">Construtor</p>
            <h1 className="text-2xl font-semibold text-gray-900">Builder visual de bases</h1>
            <p className="text-sm text-gray-500 mt-1">
              Conecte datasets internos por chaves comuns, defina as colunas finais e publique uma nova base no warehouse.
            </p>
          </div>
          {selectedDataset && (
            <div className="flex gap-2">
              <button
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700"
                onClick={handlePreview}
                disabled={loading}
              >
                <Eye className="mr-2 inline w-4 h-4" />
                Preview
              </button>
              <button
                className="rounded-xl bg-[#5B4DFF] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                onClick={handlePublish}
                disabled={loading}
              >
                <PlayCircle className="mr-2 inline w-4 h-4" />
                Publicar
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-6 grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)_380px]">
          <aside className="space-y-6">
            <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-gray-900">
                <Layers3 className="w-5 h-5 text-[#5B4DFF]" />
                <h2 className="text-sm font-semibold">Bases derivadas</h2>
              </div>
              <div className="mt-4 flex gap-2">
                <input
                  className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm"
                  placeholder="Nova base..."
                  value={newDatasetName}
                  onChange={(event) => setNewDatasetName(event.target.value)}
                />
                <button
                  className="rounded-xl bg-[#5B4DFF] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                  onClick={handleCreateDataset}
                  disabled={loading || !newDatasetName.trim()}
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-4 space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {safeDatasetDefinitions.map((dataset) => (
                  <button
                    key={dataset.id}
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                      selectedDatasetId === dataset.id
                        ? 'border-[#5B4DFF] bg-[#F5F3FF]'
                        : 'border-gray-100 bg-[#FAFBFE] hover:border-gray-200'
                    }`}
                    onClick={() => setSelectedDatasetId(dataset.id)}
                  >
                    <p className="text-sm font-semibold text-gray-900">{dataset.name}</p>
                    <p className="mt-1 text-xs text-gray-500">{dataset.slug}</p>
                    <p className="mt-1 text-[11px] font-medium text-[#5B4DFF] uppercase">{dataset.status}</p>
                  </button>
                ))}
                {!datasetDefinitions.length && (
                  <p className="text-sm text-gray-500">Nenhuma base derivada criada ainda.</p>
                )}
              </div>
            </section>

            <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-gray-900">
                <Table2 className="w-5 h-5 text-[#5B4DFF]" />
                <h2 className="text-sm font-semibold">Datasets fonte</h2>
              </div>
              <div className="mt-4 space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {safeSourceDatasets.map((dataset) => (
                  <div key={dataset.id} className="rounded-2xl border border-gray-100 bg-[#FAFBFE] px-4 py-3">
                    <p className="text-sm font-semibold text-gray-900">{dataset.name}</p>
                    <p className="text-xs text-gray-500">{dataset.warehouse_schema}.{dataset.warehouse_table}</p>
                    <p className="mt-1 text-[11px] text-gray-400">{dataset.slug}</p>
                  </div>
                ))}
              </div>
            </section>
          </aside>

          <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {selectedDataset ? selectedDataset.name : 'Selecione uma base'}
                </h2>
                <p className="text-sm text-gray-500">
                  {selectedDataset
                    ? `${selectedDataset.warehouse_schema}.${selectedDataset.warehouse_table ?? '(sem tabela)'}`
                    : 'Escolha uma base derivada para montar o fluxo visual.'}
                </p>
              </div>
              <div className="rounded-full bg-[#F5F3FF] px-3 py-1 text-xs font-semibold text-[#5B4DFF]">
                {safeNodes.length} nodes · {safeEdges.length} joins
              </div>
            </div>

            <div className="mt-6 rounded-[28px] border border-[#E6E9F4] bg-[radial-gradient(circle_at_top_left,_rgba(91,77,255,0.12),_transparent_28%),linear-gradient(180deg,#FBFCFF_0%,#F4F7FB_100%)] overflow-x-auto">
              <div
                ref={canvasRef}
                className="relative min-w-[1360px]"
                style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}
                onPointerMove={handleCanvasPointerMove}
                onPointerUp={() => {
                  void handleCanvasPointerUp();
                }}
                onPointerLeave={() => {
                  void handleCanvasPointerUp();
                }}
              >
                <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`} preserveAspectRatio="none">
                  <defs>
                    <pattern id="dotGrid" width="32" height="32" patternUnits="userSpaceOnUse">
                      <circle cx="1.5" cy="1.5" r="1.5" fill="#E2E8F0" />
                    </pattern>
                    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0" dy="8" stdDeviation="10" floodColor="#B8C1D9" floodOpacity="0.16" />
                    </filter>
                  </defs>
                  <rect width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill="url(#dotGrid)" opacity="0.55" />
                  {temporaryConnectionPath && (
                    <path
                      d={temporaryConnectionPath}
                      fill="none"
                      stroke="#5B4DFF"
                      strokeWidth="3"
                      strokeDasharray="10 8"
                      opacity="0.75"
                    />
                  )}
                  {visualEdges.map((edge) => (
                    <g key={edge.id}>
                      <path
                        d={edge.path}
                        fill="none"
                        stroke={selectedEdgeId === edge.id ? '#111827' : edge.join_type === 'inner' ? '#5B4DFF' : '#7C89A5'}
                        strokeWidth={selectedEdgeId === edge.id ? '4' : '3'}
                        strokeDasharray={edge.join_type === 'inner' ? '0' : '8 6'}
                        filter="url(#softShadow)"
                        className="cursor-pointer"
                        onClick={() => handleSelectEdge(edge)}
                      />
                      <rect
                        x={edge.labelX - 34}
                        y={edge.labelY - 14}
                        width="68"
                        height="24"
                        rx="12"
                        fill="#FFFFFF"
                        stroke={selectedEdgeId === edge.id ? '#111827' : edge.join_type === 'inner' ? '#5B4DFF' : '#CBD5E1'}
                        className="cursor-pointer"
                        onClick={() => handleSelectEdge(edge)}
                      />
                      <text
                        x={edge.labelX}
                        y={edge.labelY + 2}
                        textAnchor="middle"
                        className="fill-slate-600"
                        style={{ fontSize: 10, fontWeight: 700 }}
                      >
                        {edge.join_type.toUpperCase()}
                      </text>
                    </g>
                  ))}
                </svg>

                {visualNodes.map((node) => {
                  const fieldCount = nodeFieldOptions[node.id]?.length ?? 0;
                  const isSelected = selectedNodeId === node.id;
                  const isConnectionSource = connectionSourceNodeId === node.id;
                  const isConnectionTarget = Boolean(connectionSourceNodeId && connectionSourceNodeId !== node.id);
                  const isHoveredTarget = hoveredNodeId === node.id && isConnectionTarget;
                  return (
                    <div
                      key={node.id}
                      className={`absolute rounded-[28px] border bg-white/95 p-5 backdrop-blur transition-shadow ${
                        isSelected
                          ? 'border-[#5B4DFF] ring-4 ring-[#5B4DFF]/10 shadow-[0_28px_70px_rgba(91,77,255,0.24)]'
                          : isConnectionSource
                            ? 'border-[#111827] ring-4 ring-[#111827]/10 shadow-[0_28px_70px_rgba(17,24,39,0.18)]'
                            : isConnectionTarget
                              ? 'border-[#C4B5FD] hover:border-[#8B5CF6] hover:ring-2 hover:ring-[#8B5CF6]/10'
                          : 'border-[#DDE2F2] shadow-[0_20px_40px_rgba(148,163,184,0.14)]'
                      } ${
                        draggingNodeId === node.id ? 'cursor-grabbing shadow-[0_24px_60px_rgba(91,77,255,0.22)]' : 'cursor-grab'
                      }`}
                      style={{
                        width: NODE_CARD_WIDTH,
                        height: NODE_CARD_HEIGHT,
                        left: node.pos_x,
                        top: node.pos_y,
                      }}
                      onPointerDown={(event) => handleNodePointerDown(event, node.id)}
                      onClick={() => handleNodeClick(node.id)}
                      onMouseEnter={() => {
                        if (connectionSourceNodeId && connectionSourceNodeId !== node.id) {
                          setHoveredNodeId(node.id);
                        }
                      }}
                      onMouseLeave={() => {
                        if (hoveredNodeId === node.id) {
                          setHoveredNodeId(null);
                        }
                      }}
                    >
                      <button
                        className={`absolute -left-3 top-1/2 z-10 h-6 w-6 -translate-y-1/2 rounded-full border-2 bg-white transition ${
                          isHoveredTarget
                            ? 'border-[#5B4DFF] shadow-[0_0_0_6px_rgba(91,77,255,0.12)]'
                            : 'border-[#CBD5E1]'
                        }`}
                        title={connectionSourceNodeId && connectionSourceNodeId !== node.id ? 'Receber conexão' : 'Selecionar node'}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleTargetHandleClick(node.id);
                        }}
                      >
                        <span className="block h-full w-full rounded-full bg-[#EEF2FF]" />
                      </button>
                      <button
                        className={`absolute -right-3 top-1/2 z-10 h-6 w-6 -translate-y-1/2 rounded-full border-2 bg-white transition ${
                          isConnectionSource
                            ? 'border-[#111827] shadow-[0_0_0_6px_rgba(17,24,39,0.08)]'
                            : 'border-[#5B4DFF]'
                        }`}
                        title="Iniciar conexão"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleStartConnectionFromNode(node.id);
                        }}
                      >
                        <span className="block h-full w-full rounded-full bg-[#5B4DFF]" />
                      </button>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#5B4DFF]">Node</p>
                          <h3 className="mt-1 truncate text-base font-semibold text-slate-900">{node.label}</h3>
                          <p className="mt-1 truncate text-xs text-slate-500">
                            {node.source ? `${node.source.name}` : `Dataset #${node.source_dataset_id ?? '-'}`}
                          </p>
                        </div>
                        <button
                          className="rounded-full p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-500"
                          onClick={() => selectedDatasetId && deleteDatasetNode(selectedDatasetId, node.id).then(() => refreshDatasetDetails(selectedDatasetId))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="mt-5 flex items-end justify-between">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Campos</p>
                          <p className="mt-1 text-lg font-semibold text-slate-800">{fieldCount}</p>
                        </div>
                        <div className="rounded-2xl bg-[#F6F7FF] px-3 py-2 text-xs font-medium text-slate-600">
                          {node.source?.warehouse_schema}.{node.source?.warehouse_table}
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">
                        <span>Entrada</span>
                        <span>Saída</span>
                      </div>
                    </div>
                  );
                })}

                {!selectedDataset && (
                  <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">
                    Selecione uma base derivada para montar o fluxo.
                  </div>
                )}
              </div>
            </div>
          </section>

          <aside className="space-y-6">
            <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
              {selectedNode ? (
                <>
                  <div className="flex items-center gap-2 text-gray-900">
                    <Plus className="w-4 h-4 text-[#5B4DFF]" />
                    <h2 className="text-sm font-semibold">Node selecionado</h2>
                  </div>
                  <div className="mt-4 space-y-3">
                    <div className="rounded-2xl border border-[#E3E8F7] bg-[#F8F9FF] px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#5B4DFF]">Dataset</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{selectedNode.source?.name ?? selectedNode.label}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {selectedNode.source?.warehouse_schema}.{selectedNode.source?.warehouse_table}
                      </p>
                    </div>
                    <input
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                      placeholder="Label do node"
                      value={selectedNodeLabelDraft}
                      onChange={(event) => setSelectedNodeLabelDraft(event.target.value)}
                    />
                    <button
                      className="w-full rounded-xl bg-[#111827] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                      onClick={handleSaveSelectedNode}
                      disabled={loading || !selectedNodeLabelDraft.trim() || selectedNodeLabelDraft.trim() === selectedNode.label}
                    >
                      Salvar node
                    </button>
                    {connectionSourceNodeId === selectedNode.id ? (
                      <button
                        className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600"
                        onClick={handleCancelConnection}
                        disabled={loading}
                      >
                        Cancelar conexão
                      </button>
                    ) : (
                      <button
                        className="w-full rounded-xl border border-[#5B4DFF]/20 bg-[#F5F3FF] px-4 py-2 text-sm font-medium text-[#5B4DFF] disabled:opacity-60"
                        onClick={handleStartConnection}
                        disabled={loading || safeNodes.length < 2}
                      >
                        Conectar visualmente
                      </button>
                    )}
                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
                      <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                        <span className="font-semibold text-slate-700">Campos</span>
                        <p className="mt-1">{nodeFieldOptions[selectedNode.id]?.length ?? 0}</p>
                      </div>
                      <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                        <span className="font-semibold text-slate-700">Conexões</span>
                        <p className="mt-1">{selectedNodeEdges.length}</p>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-gray-900">
                    <Plus className="w-4 h-4 text-[#5B4DFF]" />
                    <h2 className="text-sm font-semibold">Adicionar node</h2>
                  </div>
                  <div className="mt-4 space-y-2">
                    <select
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                      value={newNodeSourceId}
                      onChange={(event) => {
                        const sourceId = event.target.value;
                        setNewNodeSourceId(sourceId);
                        const source = safeSourceDatasets.find((item) => String(item.id) === sourceId);
                        if (source && !newNodeLabel) {
                          setNewNodeLabel(source.name);
                        }
                      }}
                    >
                      <option value="">Selecionar dataset fonte...</option>
                      {safeSourceDatasets.map((dataset) => (
                        <option key={dataset.id} value={dataset.id}>
                          {dataset.name}
                        </option>
                      ))}
                    </select>
                    <input
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                      placeholder="Label do node"
                      value={newNodeLabel}
                      onChange={(event) => setNewNodeLabel(event.target.value)}
                    />
                    <button
                      className="w-full rounded-xl bg-[#111827] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                      onClick={handleCreateNode}
                      disabled={loading || !selectedDatasetId || !newNodeSourceId || !newNodeLabel.trim()}
                    >
                      Adicionar node
                    </button>
                  </div>
                </>
              )}
            </section>

            <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-gray-900">
                <GitBranch className="w-4 h-4 text-[#5B4DFF]" />
                <h2 className="text-sm font-semibold">{selectedEdge ? 'Editar join' : 'Criar join'}</h2>
              </div>
              {connectionSourceNode && (
                <div className="mt-4 rounded-2xl border border-[#DDD6FE] bg-[#F5F3FF] px-4 py-3 text-xs text-[#5B4DFF]">
                  <p className="font-semibold">Modo de conexão ativo</p>
                  <p className="mt-1">
                    Origem: <span className="text-slate-800">{connectionSourceNode.label}</span>
                  </p>
                  <p className="mt-1 text-slate-600">Clique em outro node no canvas para definir o destino.</p>
                </div>
              )}
              <div className="mt-4 space-y-2">
                {suggestedJoinFields && newEdge.from_node_id && newEdge.to_node_id && (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">
                    <p className="font-semibold">Sugestão automática encontrada</p>
                    <p className="mt-1">
                      {suggestedJoinFields.from} → {suggestedJoinFields.to}
                    </p>
                  </div>
                )}
                <select
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                  value={newEdge.from_node_id}
                  onChange={(event) =>
                    setNewEdge((prev) => ({ ...prev, from_node_id: event.target.value, from_field: '', to_field: '' }))
                  }
                >
                  <option value="">Node origem...</option>
                  {safeNodes.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.label}
                    </option>
                  ))}
                </select>
                <select
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                  value={newEdge.from_field}
                  onChange={(event) => setNewEdge((prev) => ({ ...prev, from_field: event.target.value }))}
                >
                  <option value="">Campo origem...</option>
                  {(nodeFieldOptions[Number(newEdge.from_node_id)] ?? []).map((field) => (
                    <option key={field.name} value={field.name}>
                      {field.name}{field.type ? ` (${field.type})` : ''}
                    </option>
                  ))}
                </select>
                <select
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                  value={newEdge.to_node_id}
                  onChange={(event) =>
                    setNewEdge((prev) => ({ ...prev, to_node_id: event.target.value, to_field: '' }))
                  }
                >
                  <option value="">Node destino...</option>
                  {availableTargetNodes.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.label}
                    </option>
                  ))}
                </select>
                <select
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                  value={newEdge.to_field}
                  onChange={(event) => setNewEdge((prev) => ({ ...prev, to_field: event.target.value }))}
                >
                  <option value="">Campo destino...</option>
                  {compatibleTargetFields.map((field) => (
                    <option key={field.name} value={field.name}>
                      {field.name}{field.type ? ` (${field.type})` : ''}
                    </option>
                  ))}
                </select>
                <select
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                  value={newEdge.join_type}
                  onChange={(event) => setNewEdge((prev) => ({ ...prev, join_type: event.target.value as 'left' | 'inner' }))}
                >
                  <option value="left">LEFT JOIN</option>
                  <option value="inner">INNER JOIN</option>
                </select>
                <button
                  className="w-full rounded-xl bg-[#111827] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                  onClick={selectedEdge ? handleSaveEdge : handleCreateEdge}
                  disabled={loading || !selectedDatasetId || !newEdge.from_node_id || !newEdge.to_node_id || !newEdge.from_field || !newEdge.to_field}
                >
                  {selectedEdge ? 'Salvar join' : 'Adicionar join'}
                </button>
                {selectedEdge && (
                  <button
                    className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600"
                    onClick={() => void handleDeleteEdge(selectedEdge.id)}
                    disabled={loading}
                  >
                    Excluir join selecionado
                  </button>
                )}
                {(connectionSourceNodeId || newEdge.from_node_id || newEdge.to_node_id) && (
                  <button
                    className="w-full rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600"
                    onClick={handleCancelConnection}
                    disabled={loading}
                  >
                    Limpar join atual
                  </button>
                )}
              </div>

              {safeEdges.length > 0 && (
                <div className="mt-4 space-y-2">
                  {safeEdges.map((edge) => (
                    <div key={edge.id} className="rounded-2xl border border-gray-100 bg-[#FAFBFE] px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-xs text-slate-600">
                          <p className="font-semibold text-slate-900">
                            {nodeMap[edge.from_node_id]?.label ?? `#${edge.from_node_id}`} → {nodeMap[edge.to_node_id]?.label ?? `#${edge.to_node_id}`}
                          </p>
                          <p className="mt-1">{edge.from_field} = {edge.to_field}</p>
                          <p className="mt-1 font-medium uppercase text-[#5B4DFF]">{edge.join_type}</p>
                        </div>
                        <button
                          className="text-red-500"
                          onClick={() => void handleDeleteEdge(edge.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-gray-900">
                <Table2 className="w-4 h-4 text-[#5B4DFF]" />
                <h2 className="text-sm font-semibold">Colunas finais</h2>
              </div>
              <div className="mt-4 space-y-2">
                <select
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                  value={newColumn.node_id}
                  onChange={(event) => setNewColumn((prev) => ({ ...prev, node_id: event.target.value, source_column: '', output_column: '' }))}
                >
                  <option value="">Node...</option>
                  {safeNodes.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.label}
                    </option>
                  ))}
                </select>
                <select
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                  value={newColumn.source_column}
                  onChange={(event) => {
                    const sourceColumn = event.target.value;
                    setNewColumn((prev) => ({
                      ...prev,
                      source_column: sourceColumn,
                      output_column: prev.output_column || sourceColumn,
                    }));
                  }}
                >
                  <option value="">Coluna origem...</option>
                  {(nodeFieldOptions[Number(newColumn.node_id)] ?? []).map((field) => (
                    <option key={field.name} value={field.name}>
                      {field.name}{field.type ? ` (${field.type})` : ''}
                    </option>
                  ))}
                </select>
                <input
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                  placeholder="Nome final da coluna"
                  value={newColumn.output_column}
                  onChange={(event) => setNewColumn((prev) => ({ ...prev, output_column: event.target.value }))}
                />
                <input
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                  placeholder="Tipo semântico (opcional)"
                  value={newColumn.semantic_type}
                  onChange={(event) => setNewColumn((prev) => ({ ...prev, semantic_type: event.target.value }))}
                />
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={newColumn.is_dimension}
                      onChange={(event) => setNewColumn((prev) => ({ ...prev, is_dimension: event.target.checked }))}
                    />
                    Dimensão
                  </label>
                  <label className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={newColumn.is_metric}
                      onChange={(event) => setNewColumn((prev) => ({ ...prev, is_metric: event.target.checked }))}
                    />
                    Métrica
                  </label>
                </div>
                <button
                  className="w-full rounded-xl bg-[#111827] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                  onClick={handleCreateColumn}
                  disabled={loading || !selectedDatasetId || !newColumn.node_id || !newColumn.source_column || !newColumn.output_column}
                >
                  Adicionar coluna
                </button>
              </div>

              {selectedColumns.length > 0 && (
                <div className="mt-4 space-y-2 max-h-[280px] overflow-y-auto pr-1">
                  {(selectedNode ? selectedNodeColumns : selectedColumns).map((column) => (
                    <div key={column.id} className="rounded-2xl border border-gray-100 bg-[#FAFBFE] px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-xs text-slate-600">
                          <p className="font-semibold text-slate-900">{column.output_column}</p>
                          <p className="mt-1">{column.source_column}</p>
                          <p className="mt-1">
                            {column.is_dimension ? 'Dimensão' : ''}
                            {column.is_dimension && column.is_metric ? ' · ' : ''}
                            {column.is_metric ? 'Métrica' : ''}
                          </p>
                        </div>
                        <button
                          className="text-red-500"
                          onClick={() => selectedDatasetId && deleteDatasetSelectedColumn(selectedDatasetId, column.id).then(() => refreshDatasetDetails(selectedDatasetId))}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </aside>
        </div>

        <section className="mt-6 rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 text-gray-900">
            <GitBranch className="w-5 h-5 text-[#5B4DFF]" />
            <h2 className="text-sm font-semibold">Preview da base</h2>
          </div>
          {!selectedDataset && <p className="mt-4 text-sm text-gray-500">Selecione uma base derivada para ver o preview.</p>}
          {selectedDataset && !preview && (
            <p className="mt-4 text-sm text-gray-500">Monte a base e clique em Preview para inspecionar o SQL e as linhas resultantes.</p>
          )}
          {preview && (
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl border border-gray-100 bg-[#0F172A] p-4 text-xs text-slate-200 overflow-x-auto">
                <pre>{preview.sql}</pre>
              </div>
              <div className="overflow-x-auto rounded-2xl border border-gray-100">
                <table className="min-w-full text-sm">
                  <thead className="bg-[#F8F9FC]">
                    <tr>
                      {preview.columns.map((column) => (
                        <th key={column.output_column} className="px-3 py-2 text-left font-semibold text-gray-700">
                          {column.output_column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row, index) => (
                      <tr key={index} className="border-t border-gray-100">
                        {preview.columns.map((column) => (
                          <td key={`${index}-${column.output_column}`} className="px-3 py-2 text-gray-600">
                            {String(row[column.output_column] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
