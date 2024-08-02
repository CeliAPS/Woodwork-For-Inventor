/*
  Copyright (C) 2021-2024 by Celi APS, Inc.
  All rights reserved.

  XML dump JavaScript postprocessor

  Date: 2021-11-24
*/

export var mandatorySettings = {
    description: 'XML dump',
    legal: 'Copyright (C) 2021-2024 by Celi APS, Inc.',
    longDescription: 'Generic XML postprocessor for full info dump',
    certificationLevel: 3,
    minimumRevision: 6,
    fileExtension: 'xml',
    setCodePage: 'UTF8',
    unit: 'cm',
    operationSort: 'ByOrder', // ByOrder, BySide, ByOperation
};

var doubleFormat = Utility.CreateFormat({ decimals: 5, trim: true, scale: 1.0 });
var intFormat = Utility.CreateFormat({ decimals: 0, trim: true, forceDecimal: false, scale: 1.0 });

export function sideTransforms(sizes, corner, callFromNesting) {
    return new Array();
}

var level;
export function onPostprocess() {
    level = -1;
    var fileName = 'FullDumpFor' + Job.Clampings[0].Part.Code;
    var content = '<?xml version="1.0" encoding="UTF-8"?>\n';
    content += collectObjects(Job, 'Job', '');
    Utility.WriteFile(fileName, mandatorySettings.fileExtension, content, "allClamps");
    return;
}

function collectObjects(obj, name, parentName) {
    level += 1;
    var output = "";
    var accurateName = qualifyObjectName(obj, name, parentName);
    var accurateObj = qualifyObjectType(obj, parentName);
    var { enums, insideObjects } = collectObjectsInside(accurateObj);

    var props = collectProperties(accurateObj, enums);
    if (insideObjects.length == 0) {
        output = closedTag(accurateName, props);
    } else {
        output = openedTag(accurateName, props);
    }

    insideObjects.forEach(key => {
        output += collectObjects(accurateObj[key], key, accurateName);
    });

    if (insideObjects.length != 0) {
        output += endTag(accurateName);
    }
    level -= 1;
    return output;
}

function qualifyObjectName(obj, objectName, parentName) {
    var name = objectName;
    if (parentName == 'Clampings') {
        return 'Clamping';
    }
    if (parentName == 'Sides') {
        return 'Side';
    }
    if (parentName == 'MiddleRemovalContours' || parentName == 'FinishContours') {
        return 'PockContour';
    }
    if (parentName == 'PrimaryContours') {
        return 'PrimaryContour';
    }
    if (parentName == 'Covers') {
        return 'Cover';
    }

    if (parentName == 'Operations') {
        switch (obj.OperationType) {
            case OperationTypeEnum.DrillOperation:
                name = 'DrillOperation';
                break;
            case OperationTypeEnum.MillOperation:
                name = 'MillOperation';
                break;
            case OperationTypeEnum.PocketOperation:
                name = 'PockOperation';
                break;
            case OperationTypeEnum.CutOperation:
                name = 'CutOperation';
                break;
            case OperationTypeEnum.GrooveOperation:
                name = 'GrooveOperation';
                break;
            case OperationTypeEnum.NestingOperation:
                name = 'NestOperation';
                break;
            case OperationTypeEnum.CalibrationOperation:
                name = 'MillCalibrationOperation';
                break;
            case OperationTypeEnum.CutCalibrationOperation:
                name = 'CutCalibrationOperation';
                break;
            case OperationTypeEnum.Macro:
                name = 'MacroOperation';
                break;
            default:
                name = 'UnknownOperation';
        }
        return name;
    }

    if (parentName == 'Trajectories') {
        switch (obj.TrajectoryType) {
            case TrajectoryTypeEnum.DrillTrajectory:
                name = 'DrillTrajectory';
                break;
            case TrajectoryTypeEnum.MillTrajectory:
                name = 'MillTrajectory';
                break;
            case TrajectoryTypeEnum.PocketTrajectory:
                name = 'PockTrajectory';
                break;
            case TrajectoryTypeEnum.CutTrajectory:
                name = 'CutTrajectory';
                break;
            case TrajectoryTypeEnum.GrooveTrajectory:
                name = 'GrooveTrajectory';
                break;
            case TrajectoryTypeEnum.NestingTrajectory:
                name = 'NestingTrajectory';
                break;
            case TrajectoryTypeEnum.CalibrationTrajectory:
                name = 'MillCalibrationTrajectory';
                break;
            case TrajectoryTypeEnum.CutCalibrationTrajectory:
                name = 'CutCalibrationTrajectory';
                break;
            case TrajectoryTypeEnum.MacroTrajectory:
                name = 'MacroTrajectory';
                break;
            default:
                name = 'UnknownTrajectory';
        }
        return name;
    }

    if (parentName == 'Geometry') {
        switch (obj.GeometryType) {
            case GeometryTypeEnum.Point:
                name = 'Point';
                break;
            case GeometryTypeEnum.Segment:
                name = 'Segment';
                break;
            case GeometryTypeEnum.Arc:
                name = 'Arc';
                break;
            default:
                name = 'UnknownGeometry';
        }
        return name;
    }

    return name;
}
function qualifyObjectType(obj, parentName) {
    var typedObj = obj;
    if (parentName == 'Operations') {
        switch (obj.OperationType) {
            case OperationTypeEnum.DrillOperation:
                typedObj = host.asType(DrillOperation, obj);
                break;
            case OperationTypeEnum.MillOperation:
                typedObj = host.asType(MillOperation, obj);
                break;
            case OperationTypeEnum.PocketOperation:
                typedObj = host.asType(PockOperation, obj);
                break;
            case OperationTypeEnum.NestingOperation:
                typedObj = host.asType(NestOperation, obj);
                break;
            case OperationTypeEnum.CalibrationOperation:
                typedObj = host.asType(MillCalibrationOperation, obj);
                break;
            case OperationTypeEnum.CutOperation:
                typedObj = host.asType(CutOperation, obj);
                break;
            case OperationTypeEnum.GrooveOperation:
                typedObj = host.asType(GrooveOperation, obj);
                break;
            case OperationTypeEnum.CalibrationOperation:
                typedObj = host.asType(MillCalibrationOperation, obj);
                break;
            case OperationTypeEnum.CutCalibrationOperation:
                typedObj = host.asType(CutCalibrationOperation, obj);
                break;
            case OperationTypeEnum.MacroOperation:
                typedObj = host.asType(MacroOperation, obj);
                break;
            default:
                typedObj = null;
        }
        return typedObj;
    }

    if (parentName == 'Trajectories') {
        switch (obj.TrajectoryType) {
            case TrajectoryTypeEnum.DrillTrajectory:
                typedObj = host.asType(DrillTrajectory, obj);
                break;
            case TrajectoryTypeEnum.MillTrajectory:
                typedObj = host.asType(MillTrajectory, obj);
                break;
            case TrajectoryTypeEnum.PocketTrajectory:
                typedObj = host.asType(PockTrajectory, obj);
                break;
            case TrajectoryTypeEnum.CutTrajectory:
                typedObj = host.asType(CutTrajectory, obj);
                break;
            case TrajectoryTypeEnum.GrooveTrajectory:
                typedObj = host.asType(GrooveTrajectory, obj);
                break;
            case TrajectoryTypeEnum.NestingTrajectory:
                typedObj = host.asType(NestTrajectory, obj);
                break;
            case TrajectoryTypeEnum.CalibrationTrajectory:
                typedObj = host.asType(MillCalibrationTrajectory, obj);
                break;
            case TrajectoryTypeEnum.CutCalibrationTrajectory:
                typedObj = host.asType(CutCalibrationTrajectory, obj);
                break;
            default:
                typedObj = null;
        }
        return typedObj;
    }

    if (parentName == 'Geometry') {
        switch (obj.GeometryType) {
            case GeometryTypeEnum.Point:
                typedObj = host.asType(Point, obj);
                break;
            case GeometryTypeEnum.Segment:
                typedObj = host.asType(Segment, obj);
                break;
            case GeometryTypeEnum.Arc:
                typedObj = host.asType(Arc, obj);
                break;
            default:
                typedObj = null;
        }
        return typedObj;
    }

    return typedObj;
}
function collectObjectsInside(obj) {
    var insideObjects = new Array();
    var enums = new Array();
    for (var key in obj) {
        if (obj[key] == null && obj[key] == undefined) {
            continue;
        }
        const objTypeof = typeof obj[key];
        if (objTypeof == 'object') {
            // separate enums
            if (isItEnum(key)) {
                enums.push(key);
            } else {
                insideObjects.push(key);
            }
        }
    }
    enums = Array.from(enums).sort();
    // do not sort Side objects   
    if (insideObjects.length > 0) {
        if (obj[insideObjects[0]].InclinedPlane !== undefined)
            return { enums, insideObjects };
    }

    insideObjects = Array.from(insideObjects).sort();
    return { enums, insideObjects };
}
function isItEnum(key) {
    return (
        key == 'ClampingCorner' ||
        key == 'ClampingBodyType' ||
        key == 'RotationDirection' ||
        key == 'ToolIdentifiedBy' ||
        key == 'OffsetType' ||
        key == 'OperationType' ||
        key == 'TrajectoryType' ||
        key == 'OffsetSide' ||
        key == 'GeometryType' ||
        key == 'LeadType' ||
        key == 'ContourGeometryType' ||
        key == 'CoverType' ||
        key == 'SawInitialPosition');
}
function collectProperties(obj, enums) {
    var properties = new Array();
    var output = '';

    enums.forEach(enumName => {
        output += ' ' + enumName + '="' + beautify(resolveEnum(obj, enumName)) + '"';
    });

    for (var key in obj) {
        const objTypeof = typeof obj[key];
        switch (objTypeof) {
            case 'function':
                break;
            case 'object':
                break;
            default:
                if (key != 'IsReadOnly') {
                    properties.push(key);
                }
        }
    }
    var sortedProperties = Array.from(properties).sort();
    sortedProperties.forEach(key => {
        if (typeof (obj[key]) === 'number') {
            output += ' ' + key + '=' + beautify(obj[key]);
        }
        else {
            output += ' ' + key + '="' + beautify(obj[key]) + '"';
        }
    });

    return output;
}
function resolveEnum(obj, enumName) {
    var output = '';
    if (obj == null || obj == undefined)
        return output;

    switch (enumName) {
        case 'ClampingCorner':
            output = resolveEnumClampingCorner(obj);
            break;
        case 'ClampingBodyType':
            output = resolveEnumClampingBodyType(obj);
            break;
        case 'RotationDirection':
            output = resolveEnumRotationDirection(obj);
            break;
        case 'OperationType':
            output = resolveEnumOperationType(obj);
            break;
        case 'TrajectoryType':
            output = resolveEnumTrajectoryType(obj);
            break;
        case 'GeometryType':
            output = resolveEnumGeometryType(obj);
            break;
        case 'OffsetType':
            output = resolveEnumOffsetType(obj);
            break;
        case 'OffsetSide':
            output = resolveEnumOffsetSide(obj);
            break;
        case 'ToolIdentifiedBy':
            output = resolveEnumToolSpecifying(obj);
            break;
        case 'LeadType':
            output = resolveEnumLeadType(obj);
            break;
        case 'ContourGeometryType':
            output = resolveEnumContourGeometryType(obj);
            break;
        case 'CoverType':
            output = resolveEnumCoverType(obj);
            break;
        default:
            output = '';
            break;
    }
    return output;
}
function resolveEnumClampingCorner(obj) {
    var output = '';
    switch (obj.ClampingCorner) {
        case ClampingCornerEnum.FrontLeft:
            output = 'FrontLeft';
            break;
        case ClampingCornerEnum.FrontRight:
            output = 'FrontRight';
            break;
        case ClampingCornerEnum.BackLeft:
            output = 'BackLeft';
            break;
        case ClampingCornerEnum.BackRight:
            output = 'BackRight';
            break;
        default:
            output = 'Unknown';
            break;
    }
    return output;
}
function resolveEnumClampingBodyType(obj) {
    var output = '';
    switch (obj.ClampingBodyType) {
        case ClampingBodyTypeEnum.Workpiece:
            output = 'Workpiece';
            break;
        case ClampingBodyTypeEnum.WorkpieceWithOversize:
            output = 'WorkpieceWithOversize';
            break;
        case ClampingBodyTypeEnum.Part:
            output = 'Part';
            break;
        case ClampingBodyTypeEnum.PartWithoutCovers:
            output = 'PartWithoutCovers';
            break;
        case ClampingBodyTypeEnum.PartWithoutTopAndBottomCovers:
            output = 'PartWithoutTopAndBottomCovers';
            break;
        case ClampingBodyTypeEnum.PartWithoutSideCovers:
            output = 'PartWithoutSideCovers';
            break;
        case ClampingBodyTypeEnum.WorkpieceWithMainCoversAndOversize:
            output = 'WorkpieceWithMainCoversAndOversize';
            break;
        case ClampingBodyTypeEnum.WorkpieceWithMainCovers:
            output = 'WorkpieceWithMainCovers';
            break;
        case ClampingBodyTypeEnum.WorkpieceWithOversizeAndCalibration:
            output = 'WorkpieceWithOversizeAndCalibration';
            break;
        case ClampingBodyTypeEnum.WorkpieceWithOversizeCalibrationAndTopBottomCovers:
            output = 'WorkpieceWithOversizeCalibrationAndTopBottomCovers';
            break;
        default:
            output = 'Unknown';
            break;
    }
    return output;
}
function resolveEnumRotationDirection(obj) {
    var output = '';
    switch (obj.RotationDirection) {
        case ToolRotationDirectionEnum.Clockwise:
            output = 'Clockwise';
            break;
        case ToolRotationDirectionEnum.Counterclockwise:
            output = 'Counterclockwise';
            break;
        default:
            output = 'Unknown';
            break;
    }
    return output;
}
function resolveEnumOperationType(obj) {
    var output = '';
    switch (obj.OperationType) {
        case OperationTypeEnum.DrillOperation:
            output = 'DrillOperation';
            break;
        case OperationTypeEnum.MillOperation:
            output = 'MillOperation';
            break;
        case OperationTypeEnum.PocketOperation:
            output = 'PockOperation';
            break;
        case OperationTypeEnum.CutOperation:
            output = 'CutOperation';
            break;
        case OperationTypeEnum.GrooveOperation:
            output = 'GrooveOperation';
            break;
        case OperationTypeEnum.NestingOperation:
            output = 'NestingOperation';
            break;
        case OperationTypeEnum.CalibrationOperation:
            output = 'MillCalibrationOperation';
            break;
        case OperationTypeEnum.CutCalibrationOperation:
            output = 'CutCalibrationOperation';
            break;
        case OperationTypeEnum.Macro:
            output = 'MacroOperation';
            break;
        default:
            output = 'Unknown';
            break;
    }
    return output;
}
function resolveEnumTrajectoryType(obj) {
    var output = '';
    switch (obj.TrajectoryType) {
        case TrajectoryTypeEnum.DrillTrajectory:
            output = 'DrillTrajectory';
            break;
        case TrajectoryTypeEnum.MillTrajectory:
            output = 'MillTrajectory';
            break;
        case TrajectoryTypeEnum.PocketTrajectory:
            output = 'PockTrajectory';
            break;
        case TrajectoryTypeEnum.MillTrajectory:
            output = 'MillTrajectory';
            break;
        case TrajectoryTypeEnum.CutTrajectory:
            output = 'CutTrajectory';
            break;
        case TrajectoryTypeEnum.GrooveTrajectory:
            output = 'GrooveTrajectory';
            break;
        case TrajectoryTypeEnum.NestingTrajectory:
            output = 'NestingTrajectory';
            break;
        case TrajectoryTypeEnum.CalibrationTrajectory:
            output = 'MillCalibrationTrajectory';
            break;
        case TrajectoryTypeEnum.CutCalibrationTrajectory:
            output = 'CutCalibrationTrajectory';
            break;
        case TrajectoryTypeEnum.MacroTrajectory:
            output = 'MacroTrajectory';
            break;
        default:
            output = 'Unknown';
            break;
    }
    return output;
}
function resolveEnumGeometryType(obj) {
    var output = '';
    switch (obj.GeometryType) {
        case GeometryTypeEnum.Point:
            output = 'Direct';
            break;
        case GeometryTypeEnum.Segment:
            output = 'Tangent';
            break;
        case GeometryTypeEnum.Arc:
            output = 'Arc';
            break;
        default:
            output = 'Unknown';
            break;
    }
    return output;
}
function resolveEnumOffsetSide(obj) {
    var output = '';
    switch (obj.OffsetSide) {
        case OffsetSideEnum.Left:
            output = 'Left';
            break;
        case OffsetSideEnum.Right:
            output = 'Right';
            break;
        case OffsetSideEnum.Center:
            output = 'Center';
            break;
        default:
            output = 'Unknown';
            break;
    }
    return output;
}
function resolveEnumOffsetType(obj) {
    var output = '';
    switch (obj.OffsetType) {
        case TrajectoryOffsetTypeEnum.Hardware:
            output = 'Hardware';
            break;
        case TrajectoryOffsetTypeEnum.Software:
            output = 'Software';
            break;
        default:
            output = 'Unknown';
            break;
    }
    return output;
}
function resolveEnumToolSpecifying(obj) {
    var output = '';
    switch (obj.ToolIdentifiedBy) {
        case ToolSpecifyingEnum.ByHoleDiameter:
            output = 'ByHoleDiameter';
            break;
        case ToolSpecifyingEnum.ByCode:
            output = 'ByCode';
            break;
        default:
            output = 'Unknown';
            break;
    }
    return output;
}
function resolveEnumLeadType(obj) {
    var output = '';
    switch (obj.LeadType) {
        case LeadTypeEnum.Direct:
            output = 'Direct';
            break;
        case LeadTypeEnum.Tangent:
            output = 'Tangent';
            break;
        case LeadTypeEnum.Arc:
            output = 'Arc';
            break;
        case LeadTypeEnum.Ramp:
            output = 'Ramp';
            break;
        case LeadTypeEnum.Perpendicular:
            output = 'Perpendicular';
            break;
        default:
            output = 'Unknown';
            break;
    }
    return output;
}
function resolveEnumContourGeometryType(obj) {
    var output = '';
    switch (obj.ContourGeometryType) {
        case ContourGeometryTypeEnum.Rectangular:
            output = 'Rectangular';
            break;
        case ContourGeometryTypeEnum.Circular:
            output = 'Circular';
            break;
        case ContourGeometryTypeEnum.Variant:
            output = 'Variant';
            break;
        default:
            output = 'Unknown';
            break;
    }
    return output;
}
function resolveEnumCoverType(obj) {
    var output = '';
    switch (obj.CoverType) {
        case CoverTypeEnum.Paint:
            output = 'Paint';
            break;
        case CoverTypeEnum.EdgeBand:
            output = 'EdgeBand';
            break;
        case CoverTypeEnum.Veneer:
            output = 'Veneer';
            break;
        case CoverTypeEnum.VeneerMultilayerCover:
            output = 'VeneerMultilayerCover';
            break;
        case CoverTypeEnum.LiquidMultilayerCover:
            output = 'LiquidMultilayerCover';
            break;
        case CoverTypeEnum.VacuumFilm:
            output = 'VacuumFilm';
            break;
        default:
            output = 'Unknown';
            break;
    }
    return output;
}
function beautify(value) {
    if (typeof (value) === 'number') {
        if (Number.isInteger(value))
            return intFormat.Output(value);
        else
            return doubleFormat.Output(value);
    }
    return value;
}
function closedTag(mainTag, props) {
    return tabulation() + '<' + mainTag + props + ' />\n';
}
function openedTag(mainTag, props) {
    return tabulation() + '<' + mainTag + props + '>\n';
}
function endTag(mainTag) {
    return tabulation() + '</' + mainTag + '>\n';
}
function tabulation() {
    var output = '';
    var i = 0;
    while (i < level) {
        output += '\t';
        i++;
    }
    return output;
}