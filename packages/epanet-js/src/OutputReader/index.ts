enum NodeResultTypes {
  Demand,
  Head,
  Pressure,
  WaterQuality,
}

enum LinkResultTypes {
  Flow,
  Velocity,
  Headloss,
  AvgWaterQuality,
  Status,
  Setting,
  ReactionRate,
  Friction,
}

export enum NodeTypes {
  Junction,
  Reservoir,
  Tank,
}

export enum LinkTypes {
  PipeWithCV,
  Pipe,
  Pump,
  PRV,
  PSV,
  PBV,
  FCV,
  TCV,
  GPV,
}

const idBytes = 32;

export interface LinkResults {
  id: string;
  type: LinkTypes;
  flow: number[];
  velocity: number[];
  headloss: number[];
  avgWaterQuality: number[];
  status: number[];
  setting: number[];
  reactionRate: number[];
  friction: number[];
  length: number;
}

export interface NodeResults {
  id: string;
  type: NodeTypes;
  demand: number[];
  head: number[];
  pressure: number[];
  waterQuality: number[];
}

export interface EpanetProlog {
  nodeCount: number;
  resAndTankCount: number;
  linkCount: number;
  pumpCount: number;
  valveCount: number;
  reportingPeriods: number;
}

export interface EpanetResults {
  prolog: EpanetProlog;
  results: {
    nodes: NodeResults[];
    links: LinkResults[];
  };
}

export function readBinary(results: Uint8Array): EpanetResults {
  const view1 = new DataView(results.buffer);
  const prolog: EpanetProlog = {
    nodeCount: view1.getInt32(8, true),
    resAndTankCount: view1.getInt32(12, true),
    linkCount: view1.getInt32(16, true),
    pumpCount: view1.getInt32(20, true),
    valveCount: view1.getInt32(24, true),
    reportingPeriods: view1.getInt32(results.byteLength - 12, true),
  };

  const offsetNodeIds = 884;
  const offsetLinkIds = offsetNodeIds + idBytes * prolog.nodeCount;
  const offsetLinkTypes =
    offsetNodeIds + 32 * prolog.nodeCount + 40 * prolog.linkCount;
  const offsetNodeIndexes =
    offsetNodeIds + 32 * prolog.nodeCount + 44 * prolog.linkCount;
  const offsetLinkLengths =
    offsetNodeIds +
    36 * prolog.nodeCount +
    44 * prolog.linkCount +
    8 * prolog.resAndTankCount;
  const offsetResults =
    offsetNodeIds +
    36 * prolog.nodeCount +
    52 * prolog.linkCount +
    8 * prolog.resAndTankCount +
    28 * prolog.pumpCount +
    4;

  const nodeIds = getIds(offsetNodeIds, prolog.nodeCount, view1);
  const nodeTypes = getNodeTypes(
    offsetNodeIndexes,
    prolog.nodeCount,
    prolog.resAndTankCount,
    view1
  );
  const linkIds = getIds(offsetLinkIds, prolog.linkCount, view1);
  const linkLengths = getLengths(offsetLinkLengths, prolog.linkCount, view1);
  const linkTypes = getLinkTypes(offsetLinkTypes, prolog.linkCount, view1);

  const nodes: NodeResults[] = [...Array(prolog.nodeCount)].map((_, i) => {
    return getNodeResults(
      prolog,
      offsetResults,
      i,
      view1,
      nodeIds[i],
      nodeTypes[i]
    );
  });
  const links: LinkResults[] = [...Array(prolog.linkCount)].map((_, i) => {
    return getLinkResults(
      prolog,
      offsetResults,
      i,
      view1,
      linkIds[i],
      linkLengths[i],
      linkTypes[i]
    );
  });

  const data: EpanetResults = {
    prolog,
    results: {
      nodes,
      links,
    },
  };
  return data;
}

const getIds = (
  offset: number,
  count: number,
  dataView: DataView
): string[] => {
  const ids: string[] = [];

  for (let i = 0; i < count; i++) {
    const arrayBuffer = dataView.buffer.slice(
      offset + idBytes * i,
      offset + idBytes * i + idBytes
    );
    ids.push(stringFrom(arrayBuffer));
  }

  return ids;
};

const getLengths = (
  offset: number,
  count: number,
  dataView: DataView
): number[] => {
  const lengths: number[] = [];

  for (let i = 0; i < count; i++) {
    const position = offset + 4 * i;
    const length = dataView.getFloat32(position, true);
    lengths.push(length);
  }

  return lengths;
};

const getNodeTypes = (
  offset: number,
  nodeCount: number,
  resAndTankCount: number,
  dataView: DataView
): NodeTypes[] => {
  const types: NodeTypes[] = [];
  const resAndTankIndexes: number[] = [];
  const resAndTankAreas: number[] = [];

  for (let i = 0; i < resAndTankCount; i++) {
    resAndTankIndexes.push(dataView.getInt32(offset + 4 * i, true) - 1);
    resAndTankAreas.push(
      dataView.getFloat32(offset + 4 * resAndTankCount + 4 * i, true)
    );
  }

  for (let i = 0; i < nodeCount; i++) {
    if (!resAndTankIndexes.includes(i)) {
      types.push(NodeTypes.Junction);
      continue;
    }

    if (resAndTankAreas[resAndTankIndexes.indexOf(i)] === 0.0) {
      types.push(NodeTypes.Reservoir);
      continue;
    }

    types.push(NodeTypes.Tank);
  }

  return types;
};

const getLinkTypes = (
  offset: number,
  count: number,
  dataView: DataView
): LinkTypes[] => {
  const types: LinkTypes[] = [];

  for (let i = 0; i < count; i++) {
    const position = offset + 4 * i;
    const length = dataView.getInt32(position, true);
    types.push(length);
  }

  return types;
};

const getNodeResults = (
  prolog: EpanetProlog,
  offsetResults: number,
  nodeIndex: number,
  dataView: DataView,
  id: string,
  type: NodeTypes
): NodeResults => {
  const nodeResults = {
    id,
    type,
    demand: [],
    head: [],
    pressure: [],
    waterQuality: [],
  };

  const result: NodeResults = [
    'demand',
    'head',
    'pressure',
    'waterQuality',
  ].reduce((map, obj, i) => {
    return {
      ...map,
      [obj]: getResultByteOffSet(
        prolog,
        offsetResults,
        true,
        nodeIndex,
        i
      ).map(x => dataView.getFloat32(x, true)),
    };
  }, nodeResults);

  return result;
};

const getLinkResults = (
  prolog: EpanetProlog,
  offsetResults: number,
  linkIndex: number,
  dataView: DataView,
  id: string,
  length: number,
  type: LinkTypes
): LinkResults => {
  const linkResults = {
    id: id,
    type,
    flow: [],
    velocity: [],
    headloss: [],
    avgWaterQuality: [],
    status: [],
    setting: [],
    reactionRate: [],
    friction: [],
    length: length,
  };

  const result: LinkResults = [
    'flow',
    'velocity',
    'headloss',
    'avgWaterQuality',
    'status',
    'setting',
    'reactionRate',
    'friction',
  ].reduce((map, obj, i) => {
    return {
      ...map,
      [obj]: getResultByteOffSet(
        prolog,
        offsetResults,
        false,
        linkIndex,
        i
      ).map(x => dataView.getFloat32(x, true)),
    };
  }, linkResults);

  return result;
};

const getResultByteOffSet = (
  prolog: EpanetProlog,
  offsetResults: number,
  isNode: boolean,
  objIndex: number,
  resultType: NodeResultTypes | LinkResultTypes
): number[] => {
  const linkResultOffset = isNode ? 0 : 16 * prolog.nodeCount;
  const typeCount = isNode ? prolog.nodeCount : prolog.linkCount;
  const resultSize = 16 * prolog.nodeCount + 32 * prolog.linkCount;
  const answer = [...Array(prolog.reportingPeriods)].map(
    (_, i) =>
      offsetResults +
      resultSize * i +
      linkResultOffset +
      4 * objIndex +
      4 * resultType * typeCount
  );
  return answer;
};

const stringFrom = (arrayBuffer: ArrayBuffer): string => {
  const array = new Uint8Array(arrayBuffer);
  const arrayNumber = Array.from(array).filter(o => o > 0);
  return String.fromCharCode.apply(null, arrayNumber);
};
