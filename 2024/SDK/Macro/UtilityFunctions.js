var xAxis = Spacial.CreateVector(1, 0, 0);
var yAxis = Spacial.CreateVector(0, 1, 0);
var zAxis = Spacial.CreateVector(0, 0, 1);

function det(V1, V2, N) {
    N.Normalize();
    var V3 = V1.CrossProduct(V2);
    var result = V3.DotProduct(N);
    return result;
}
//Detects sign for angle between angles depending on the order of the vectors fed
export function RotationSign(V1, V2, N) {
    var result;
    N.Normalize();
    var V3 = V1.CrossProduct(V2);
    if (V3.DotProduct(N) > 0) {
        result = 1;
    } else {
        result = -1;
    }
    return result;
}

//Checks for equality of two numbers by specified allowed difference value 
export function eqFusion(n1, n2, Fussion) { return (Math.abs(n1 - n2) < Fussion) }

//Function for Finding Woodwop Plane rotation angles by specifying Coordinate system
export function calWoodwopPlaneAngles(Vx, Vy, Vz) {
    var zAngle;
    var xAngle;
    var z2Angle;
    var RSignx;
    var RSign2z;
    var RSignz;
    var N;

    if (Vz.AngleTo(zAxis) < 0.01) {   //Macro system Z axis Match Top Side Zaxis
        N = Spacial.CreateVector(1, 0, 0); //new Vector(1, 0, 0); 
        RSignz = RotationSign(xAxis, Vx, zAxis); //determinates Sign of rotation angle about Z axis
        zAngle = Rad2Deg(Vx.AngleTo(xAxis)) * RSignz;
        xAngle = 0.0;
        z2Angle = 0.0;
    } else {
        if (eqFusion(Vz.AngleTo(zAxis), Math.PI, 0.01)) { //Macro system Z axis Match Bottom Side Zaxis
            var N = Spacial.CreateVector(-1, 0, 0);
            RSignz = RotationSign(xAxis, Vx, zAxis); //determinates Sign of rotation angle about Z axis
            zAngle = Rad2Deg(Vx.AngleTo(xAxis)) * RSignz;;
            xAngle = Rad2Deg(Math.PI);
            z2Angle = 0.0;
        } else {
            N = Vz.CrossProduct(zAxis);
            RSignz = RotationSign(xAxis, N, zAxis); //determinates Sign of rotation angle about Z axis
            zAngle = Rad2Deg(N.AngleTo(xAxis)) * RSignz; //calculates rotation angle about Z axis (deg)
            // Calculates Plane new X(N) axis    
            // Rotation angle about x axis
            RSignx = RotationSign(zAxis, Vz, N); //deterinates Sign of rotation angle about new x Axis (N) axis
            xAngle = Rad2Deg(xAngle = Vz.AngleTo(zAxis)) * RSignx; //calculates rotation angle about new X axis
            // Second rotation angle about new Z axis
            RSign2z = RotationSign(N, Vx, Vz); //deterinates Sign of rotation angle about new Z Axis (Vz)
            z2Angle = Rad2Deg(N.AngleTo(Vx)) * RSign2z;	//calculates rotation angle about new Z axis (Vz)
        }
    }
    return [zAngle, xAngle, z2Angle];
}

//converts cm value to mm
export function cm2mm(value) { return value * 10; }

//converts cm value to inch
// if you need to convert coordinates to inches apply this function in "FormatCoordinate" function instead "cm2mm" function
export function cm2in(value) { return value / 2.54; }

//Converts radians to degrees
export function Rad2Deg(radAngle) { return 180 / Math.PI * radAngle; }

// Converts precision of number to 3 decimal places after comma.
export function Pr(x) { return Number.parseFloat(x).toFixed(3); }

var CoordinateSystemNumber;
// Gets increment number for each next coordinate system naming
export function GenerateCoordinateSystemNumber(Increment) {
    var StartNumber = 10;
    if (typeof CoordinateSystemNumber === 'undefined')
        CoordinateSystemNumber = StartNumber;
    CoordinateSystemNumber = CoordinateSystemNumber + Increment;
    return CoordinateSystemNumber;
}

// Provides a unique name for a macro
var UniqueMacroNr;
export function UniqueMacroName(macroName) {
    if (typeof UniqueMacroNr === 'undefined')
        UniqueMacroNr = 0;
    UniqueMacroNr++;
    return macroName + UniqueMacroNr;
}