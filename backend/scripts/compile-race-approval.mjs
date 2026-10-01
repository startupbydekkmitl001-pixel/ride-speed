// Trusted offline operator preparation only; never approves or calls a project.
// Supply an explicitly exported own route/course/session and operator request.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {compileRaceCourse} from '../functions/_shared/verify-route-time.mjs';
const[inputFile,outputFile,...extra]=process.argv.slice(2);
if(!inputFile||!outputFile||extra.length)throw new Error('Usage: node scripts/compile-race-approval.mjs <private-input.json> <private-reviewed-output.json>');
const input=JSON.parse(await readFile(resolve(inputFile),'utf8')),{request,route,course,session}=input;
if(!request||request.schema_version!==1||!route||route.owner_id!==request.route_owner_id||route.id!==request.route_id||route.revision!==request.route_revision||route.geometryHash!==request.route_geometry_hash||!Array.isArray(route.segments)||route.segments.length!==1||course?.id!==request.course_id||course.closed_course_approved!==true||session?.id!==request.session_id||session.course_id!==course.id||session.approved!==true)throw new Error('Exact route/course/session authority mismatch');
const configuration=compileRaceCourse({...request.config,route_geometry:route.segments[0],boundary_polygon:course.boundary_polygon});
await writeFile(resolve(outputFile),JSON.stringify({request,configuration,operatorReviewRequired:true},null,2)+'\n',{flag:'wx'});
