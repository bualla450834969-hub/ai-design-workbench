"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  MiniMap,
  NodeResizer,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useNodesState,
  useReactFlow,
  type Node,
  type NodeChange,
  type NodeProps,
  type Viewport,
} from "@xyflow/react";
import {
  Check,
  Download,
  Focus,
  Image as ImageIcon,
  LayoutGrid,
  Maximize2,
  MessageSquareText,
  Plus,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { Asset, Project, ProjectCanvas } from "@/types/domain";
import { appPath } from "@/lib/app-path";
import { assetDownloadHref } from "@/lib/workspace-generation";
import { useProjectResultSelection } from "./project-results-panel";

const NODE_WIDTH = 320;
const NODE_HEIGHT = 258;
const GRID_GAP_X = 36;
const GRID_GAP_Y = 42;

type AssetNodeData = {
  asset: Asset;
  selectedForGeneration: boolean;
  onPreview: (asset: Asset) => void;
  onToggleReference: (asset: Asset) => void;
};

type AssetNode = Node<AssetNodeData, "asset">;

function roleLabel(role: Asset["role"]) {
  if (role === "result") return "生成结果";
  if (role === "style") return "风格参考";
  if (role === "scene") return "场景参考";
  if (role === "annotation") return "局部标注";
  if (role === "mask") return "旧版局部蒙版";
  if (role === "brief") return "需求资料";
  return "产品参考";
}

function formatCanvasTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function AssetCanvasNode({ data, selected }: NodeProps<AssetNode>) {
  const { asset, selectedForGeneration, onPreview, onToggleReference } = data;
  const selection = useProjectResultSelection();
  return <article className={`canvas-asset-node ${selected ? "selected" : ""}`}>
    <NodeResizer minWidth={220} minHeight={180} isVisible={selected} lineClassName="canvas-resizer-line" handleClassName="canvas-resizer-handle" />
    <header>
      <span><ImageIcon size={13} />{roleLabel(asset.role)}</span>
      <div className="nodrag nopan">
        <button type="button" title="预览图片" aria-label="预览图片" onClick={() => onPreview(asset)}><Maximize2 size={14} /></button>
        <a title="下载图片" aria-label="下载图片" href={assetDownloadHref(asset.url)} download={asset.name} onClick={(event) => { if (selection?.download) { event.preventDefault(); selection.download(asset); } }}><Download size={14} /></a>
      </div>
    </header>
    <button type="button" className="canvas-image-button nodrag" onDoubleClick={() => onPreview(asset)} onClick={() => onPreview(asset)}>
      <img src={appPath(asset.url)} alt={asset.name} draggable={false} />
    </button>
    <footer>
      <div><strong title={asset.name}>{asset.name}</strong><small>{formatCanvasTime(asset.createdAt)}</small></div>
      <button type="button" className={`nodrag nopan canvas-reference-button ${selectedForGeneration ? "active" : ""}`} title={selectedForGeneration ? "移出本轮生成" : "加入本轮生成"} aria-label={selectedForGeneration ? "移出本轮生成" : "加入本轮生成"} onClick={() => onToggleReference(asset)}>
        {selectedForGeneration ? <Check size={14} /> : <Plus size={14} />}
      </button>
    </footer>
  </article>;
}

const nodeTypes = { asset: AssetCanvasNode };

function defaultPosition(index: number) {
  const column = index % 4;
  const row = Math.floor(index / 4);
  return { x: column * (NODE_WIDTH + GRID_GAP_X), y: row * (NODE_HEIGHT + GRID_GAP_Y) };
}

function makeNodes(
  assets: Asset[],
  project: Project,
  selectedAssetIds: string[],
  onPreview: (asset: Asset) => void,
  onToggleReference: (asset: Asset) => void,
  existing: AssetNode[] = [],
) {
  const saved = new Map(project.canvas?.items.map((item) => [item.assetId, item]));
  const current = new Map(existing.map((node) => [node.id, node]));
  const anchored = assets.flatMap((asset) => {
    const node = current.get(asset.id);
    if (node) return [{ x: node.position.x, width: node.width ?? node.measured?.width ?? NODE_WIDTH }];
    const stored = saved.get(asset.id);
    return stored ? [{ x: stored.x, width: stored.width }] : [];
  });
  const newStartX = anchored.length ? Math.max(...anchored.map((item) => item.x + item.width)) + GRID_GAP_X : 0;
  let newIndex = 0;
  return assets.map((asset): AssetNode => {
    const currentNode = current.get(asset.id);
    const stored = saved.get(asset.id);
    const freshPosition = { x: newStartX + (newIndex % 3) * (NODE_WIDTH + GRID_GAP_X), y: Math.floor(newIndex / 3) * (NODE_HEIGHT + GRID_GAP_Y) };
    const position = currentNode?.position ?? (stored ? { x: stored.x, y: stored.y } : freshPosition);
    if (!currentNode && !stored) newIndex += 1;
    const width = currentNode?.width ?? stored?.width ?? NODE_WIDTH;
    const height = currentNode?.height ?? stored?.height ?? NODE_HEIGHT;
    return {
      id: asset.id,
      type: "asset",
      position,
      width,
      height,
      data: { asset, selectedForGeneration: selectedAssetIds.includes(asset.id), onPreview, onToggleReference },
    };
  });
}

interface ProjectCanvasProps {
  project: Project;
  assets: Asset[];
  selectedAssetIds: string[];
  uploading: boolean;
  onPreview: (asset: Asset) => void;
  onToggleReference: (asset: Asset) => void;
  onUpload: () => void;
  onBackToConversation: () => void;
  onLayoutChange: (projectId: string, canvas: ProjectCanvas) => void;
}

function CanvasStage(props: ProjectCanvasProps) {
  const imageAssets = useMemo(() => props.assets.filter((asset) => asset.type.startsWith("image/") && asset.role !== "mask" && asset.role !== "annotation"), [props.assets]);
  const initialNodes = useMemo(() => makeNodes(imageAssets, props.project, props.selectedAssetIds, props.onPreview, props.onToggleReference), []); // ProjectCanvas remounts per project.
  const [nodes, setNodes, applyNodeChanges] = useNodesState<AssetNode>(initialNodes);
  const nodesRef = useRef(nodes);
  const initialProjectRef = useRef(props.project);
  const previousAssetCountRef = useRef(imageAssets.length);
  const viewportRef = useRef<Viewport>(props.project.canvas?.viewport ?? { x: 40, y: 40, zoom: 0.9 });
  const saveTimerRef = useRef<number | null>(null);
  const { fitView, zoomIn, zoomOut } = useReactFlow<AssetNode>();
  const [zoom, setZoom] = useState(viewportRef.current.zoom);
  const assetSignature = imageAssets.map((asset) => `${asset.id}:${asset.createdAt}`).join("|");
  const selectionSignature = props.selectedAssetIds.join("|");

  useEffect(() => { nodesRef.current = nodes; }, [nodes]);

  const persistSoon = useCallback(() => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      props.onLayoutChange(props.project.id, {
        items: nodesRef.current.map((node) => ({
          assetId: node.id,
          x: node.position.x,
          y: node.position.y,
          width: Math.max(220, node.width ?? node.measured?.width ?? NODE_WIDTH),
          height: Math.max(180, node.height ?? node.measured?.height ?? NODE_HEIGHT),
        })),
        viewport: viewportRef.current,
      });
    }, 550);
  }, [props.onLayoutChange, props.project.id]);

  useEffect(() => () => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
  }, []);

  useEffect(() => {
    const addedAssets = imageAssets.length > previousAssetCountRef.current;
    previousAssetCountRef.current = imageAssets.length;
    setNodes((current) => {
      const next = makeNodes(imageAssets, initialProjectRef.current, props.selectedAssetIds, props.onPreview, props.onToggleReference, current);
      nodesRef.current = next;
      return next;
    });
    persistSoon();
    if (addedAssets) window.setTimeout(() => fitView({ padding: 0.16, duration: 320, maxZoom: 1 }), 30);
  }, [assetSignature, selectionSignature, props.onPreview, props.onToggleReference, setNodes, persistSoon, fitView]);

  const onNodesChange = useCallback((changes: NodeChange<AssetNode>[]) => {
    applyNodeChanges(changes);
    if (changes.some((change) => (change.type === "position" && change.dragging === false) || (change.type === "dimensions" && change.resizing === false))) persistSoon();
  }, [applyNodeChanges, persistSoon]);

  const arrange = useCallback(() => {
    setNodes((current) => {
      const next = current.map((node, index) => ({ ...node, position: defaultPosition(index), width: NODE_WIDTH, height: NODE_HEIGHT }));
      nodesRef.current = next;
      return next;
    });
    persistSoon();
    window.setTimeout(() => fitView({ padding: 0.16, duration: 320, maxZoom: 1 }), 30);
  }, [fitView, persistSoon, setNodes]);

  const fitAll = useCallback(() => {
    fitView({ padding: 0.16, duration: 280, minZoom: 0.08, maxZoom: 1.2 });
  }, [fitView]);

  return <section className="project-canvas" aria-label={`${props.project.name}灵感画布`}>
    <ReactFlow<AssetNode>
      nodes={nodes}
      edges={[]}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      defaultViewport={viewportRef.current}
      minZoom={0.05}
      maxZoom={4}
      nodesConnectable={false}
      deleteKeyCode={null}
      multiSelectionKeyCode="Shift"
      selectionMode={SelectionMode.Partial}
      selectionOnDrag
      panOnScroll
      panOnDrag={[1, 2]}
      zoomOnScroll={false}
      zoomOnDoubleClick={false}
      onMove={(_, viewport) => { viewportRef.current = viewport; setZoom(viewport.zoom); }}
      onMoveEnd={(_, viewport) => { viewportRef.current = viewport; setZoom(viewport.zoom); persistSoon(); }}
      fitViewOptions={{ padding: 0.16, maxZoom: 1 }}
      proOptions={{ hideAttribution: true }}
      aria-label={`${props.project.name}无限画布`}
      ariaLabelConfig={{ "minimap.ariaLabel": "画布全局导航" }}
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="#d8d9d5" />
      <Panel position="top-left" className="canvas-toolbar">
        <button type="button" title="上传图片" aria-label="上传图片" onClick={props.onUpload} disabled={props.uploading}><Upload size={16} /></button>
        <span />
        <button type="button" title="缩小" aria-label="缩小" onClick={() => zoomOut({ duration: 160 })}><ZoomOut size={16} /></button>
        <button type="button" className="canvas-zoom-value" title="当前缩放比例" aria-label={`当前缩放比例 ${Math.round(zoom * 100)}%`} onClick={fitAll}>{Math.round(zoom * 100)}%</button>
        <button type="button" title="放大" aria-label="放大" onClick={() => zoomIn({ duration: 160 })}><ZoomIn size={16} /></button>
        <button type="button" title="显示全部" aria-label="显示全部" onClick={fitAll}><Focus size={16} /></button>
        <span />
        <button type="button" title="自动排列" aria-label="自动排列" onClick={arrange}><LayoutGrid size={16} /></button>
      </Panel>
      {nodes.length > 0 && <Panel position="top-right" className="canvas-count"><ImageIcon size={14} /><strong>{nodes.length}</strong></Panel>}
      <MiniMap<AssetNode> pannable zoomable position="top-right" nodeColor={(node) => node.data.asset.role === "result" ? "#d88b35" : "#6a7872"} nodeStrokeColor="#ffffff" nodeStrokeWidth={3} maskColor="rgba(244,244,240,.7)" bgColor="#ecece8" />
    </ReactFlow>
    {!nodes.length && <div className="canvas-empty">
      <span><ImageIcon size={24} /></span>
      <strong>画布还是空的</strong>
      <div><button type="button" className="primary-button compact" onClick={props.onUpload}><Upload size={16} />上传图片</button><button type="button" className="secondary-button" onClick={props.onBackToConversation}><MessageSquareText size={16} />返回对话</button></div>
    </div>}
  </section>;
}

export function ProjectCanvas(props: ProjectCanvasProps) {
  return <ReactFlowProvider><CanvasStage {...props} /></ReactFlowProvider>;
}
