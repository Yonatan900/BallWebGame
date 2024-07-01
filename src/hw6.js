//camera settings for orbit
const EventDispatcher = THREE.EventDispatcher;
const MOUSE = THREE.MOUSE;
const Quaternion = THREE.Quaternion;
const Spherical = THREE.Spherical;
const TOUCH = THREE.TOUCH;
const Vector2 = THREE.Vector2;
const Vector3 = THREE.Vector3;
// This set of controls performs orbiting, dollying (zooming), and panning.
// Unlike TrackballControls, it maintains the "up" direction object.up (+Y by default).
//
//    Orbit - left mouse / touch: one-finger move
//    Zoom - middle mouse, or mousewheel / touch: two-finger spread or squish
//    Pan - right mouse, or left mouse + ctrl/meta/shiftKey, or arrow keys / touch: two-finger move

const _changeEvent = { type: 'change' };
const _startEvent = { type: 'start' };
const _endEvent = { type: 'end' };

class OrbitControls extends EventDispatcher {

	constructor( object, domElement ) {

		super();

		if ( domElement === undefined ) console.warn( 'THREE.OrbitControls: The second parameter "domElement" is now mandatory.' );
		if ( domElement === document ) console.error( 'THREE.OrbitControls: "document" should not be used as the target "domElement". Please use "renderer.domElement" instead.' );

		this.object = object;
		this.domElement = domElement;
		this.domElement.style.touchAction = 'none'; // disable touch scroll

		// Set to false to disable this control
		this.enabled = true;

		// "target" sets the location of focus, where the object orbits around
		this.target = new Vector3();

		// How far you can dolly in and out ( PerspectiveCamera only )
		this.minDistance = 0;
		this.maxDistance = Infinity;

		// How far you can zoom in and out ( OrthographicCamera only )
		this.minZoom = 0;
		this.maxZoom = Infinity;

		// How far you can orbit vertically, upper and lower limits.
		// Range is 0 to Math.PI radians.
		this.minPolarAngle = 0; // radians
		this.maxPolarAngle = Math.PI; // radians

		// How far you can orbit horizontally, upper and lower limits.
		// If set, the interval [ min, max ] must be a sub-interval of [ - 2 PI, 2 PI ], with ( max - min < 2 PI )
		this.minAzimuthAngle = - Infinity; // radians
		this.maxAzimuthAngle = Infinity; // radians

		// Set to true to enable damping (inertia)
		// If damping is enabled, you must call controls.update() in your animation loop
		this.enableDamping = false;
		this.dampingFactor = 0.05;

		// This option actually enables dollying in and out; left as "zoom" for backwards compatibility.
		// Set to false to disable zooming
		this.enableZoom = true;
		this.zoomSpeed = 1.0;

		// Set to false to disable rotating
		this.enableRotate = true;
		this.rotateSpeed = 1.0;

		// Set to false to disable panning
		this.enablePan = true;
		this.panSpeed = 1.0;
		this.screenSpacePanning = true; // if false, pan orthogonal to world-space direction camera.up
		this.keyPanSpeed = 7.0;	// pixels moved per arrow key push

		// Set to true to automatically rotate around the target
		// If auto-rotate is enabled, you must call controls.update() in your animation loop
		this.autoRotate = false;
		this.autoRotateSpeed = 2.0; // 30 seconds per orbit when fps is 60

		// The four arrow keys
		this.keys = { LEFT: 'ArrowLeft', UP: 'ArrowUp', RIGHT: 'ArrowRight', BOTTOM: 'ArrowDown' };

		// Mouse buttons
		this.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN };

		// Touch fingers
		this.touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN };

		// for reset
		this.target0 = this.target.clone();
		this.position0 = this.object.position.clone();
		this.zoom0 = this.object.zoom;

		// the target DOM element for key events
		this._domElementKeyEvents = null;

		//
		// public methods
		//

		this.getPolarAngle = function () {

			return spherical.phi;

		};

		this.getAzimuthalAngle = function () {

			return spherical.theta;

		};

		this.getDistance = function () {

			return this.object.position.distanceTo( this.target );

		};

		this.listenToKeyEvents = function ( domElement ) {

			domElement.addEventListener( 'keydown', onKeyDown );
			this._domElementKeyEvents = domElement;

		};

		this.saveState = function () {

			scope.target0.copy( scope.target );
			scope.position0.copy( scope.object.position );
			scope.zoom0 = scope.object.zoom;

		};

		this.reset = function () {

			scope.target.copy( scope.target0 );
			scope.object.position.copy( scope.position0 );
			scope.object.zoom = scope.zoom0;

			scope.object.updateProjectionMatrix();
			scope.dispatchEvent( _changeEvent );

			scope.update();

			state = STATE.NONE;

		};

		// this method is exposed, but perhaps it would be better if we can make it private...
		this.update = function () {

			const offset = new Vector3();

			// so camera.up is the orbit axis
			const quat = new Quaternion().setFromUnitVectors( object.up, new Vector3( 0, 1, 0 ) );
			const quatInverse = quat.clone().invert();

			const lastPosition = new Vector3();
			const lastQuaternion = new Quaternion();

			const twoPI = 2 * Math.PI;

			return function update() {

				const position = scope.object.position;

				offset.copy( position ).sub( scope.target );

				// rotate offset to "y-axis-is-up" space
				offset.applyQuaternion( quat );

				// angle from z-axis around y-axis
				spherical.setFromVector3( offset );

				if ( scope.autoRotate && state === STATE.NONE ) {

					rotateLeft( getAutoRotationAngle() );

				}

				if ( scope.enableDamping ) {

					spherical.theta += sphericalDelta.theta * scope.dampingFactor;
					spherical.phi += sphericalDelta.phi * scope.dampingFactor;

				} else {

					spherical.theta += sphericalDelta.theta;
					spherical.phi += sphericalDelta.phi;

				}

				// restrict theta to be between desired limits

				let min = scope.minAzimuthAngle;
				let max = scope.maxAzimuthAngle;

				if ( isFinite( min ) && isFinite( max ) ) {

					if ( min < - Math.PI ) min += twoPI; else if ( min > Math.PI ) min -= twoPI;

					if ( max < - Math.PI ) max += twoPI; else if ( max > Math.PI ) max -= twoPI;

					if ( min <= max ) {

						spherical.theta = Math.max( min, Math.min( max, spherical.theta ) );

					} else {

						spherical.theta = ( spherical.theta > ( min + max ) / 2 ) ?
							Math.max( min, spherical.theta ) :
							Math.min( max, spherical.theta );

					}

				}

				// restrict phi to be between desired limits
				spherical.phi = Math.max( scope.minPolarAngle, Math.min( scope.maxPolarAngle, spherical.phi ) );

				spherical.makeSafe();


				spherical.radius *= scale;

				// restrict radius to be between desired limits
				spherical.radius = Math.max( scope.minDistance, Math.min( scope.maxDistance, spherical.radius ) );

				// move target to panned location

				if ( scope.enableDamping === true ) {

					scope.target.addScaledVector( panOffset, scope.dampingFactor );

				} else {

					scope.target.add( panOffset );

				}

				offset.setFromSpherical( spherical );

				// rotate offset back to "camera-up-vector-is-up" space
				offset.applyQuaternion( quatInverse );

				position.copy( scope.target ).add( offset );

				scope.object.lookAt( scope.target );

				if ( scope.enableDamping === true ) {

					sphericalDelta.theta *= ( 1 - scope.dampingFactor );
					sphericalDelta.phi *= ( 1 - scope.dampingFactor );

					panOffset.multiplyScalar( 1 - scope.dampingFactor );

				} else {

					sphericalDelta.set( 0, 0, 0 );

					panOffset.set( 0, 0, 0 );

				}

				scale = 1;

				// update condition is:
				// min(camera displacement, camera rotation in radians)^2 > EPS
				// using small-angle approximation cos(x/2) = 1 - x^2 / 8

				if ( zoomChanged ||
					lastPosition.distanceToSquared( scope.object.position ) > EPS ||
					8 * ( 1 - lastQuaternion.dot( scope.object.quaternion ) ) > EPS ) {

					scope.dispatchEvent( _changeEvent );

					lastPosition.copy( scope.object.position );
					lastQuaternion.copy( scope.object.quaternion );
					zoomChanged = false;

					return true;

				}

				return false;

			};

		}();

		this.dispose = function () {

			scope.domElement.removeEventListener( 'contextmenu', onContextMenu );

			scope.domElement.removeEventListener( 'pointerdown', onPointerDown );
			scope.domElement.removeEventListener( 'pointercancel', onPointerCancel );
			scope.domElement.removeEventListener( 'wheel', onMouseWheel );

			scope.domElement.removeEventListener( 'pointermove', onPointerMove );
			scope.domElement.removeEventListener( 'pointerup', onPointerUp );


			if ( scope._domElementKeyEvents !== null ) {

				scope._domElementKeyEvents.removeEventListener( 'keydown', onKeyDown );

			}

			//scope.dispatchEvent( { type: 'dispose' } ); // should this be added here?

		};

		//
		// internals
		//

		const scope = this;

		const STATE = {
			NONE: - 1,
			ROTATE: 0,
			DOLLY: 1,
			PAN: 2,
			TOUCH_ROTATE: 3,
			TOUCH_PAN: 4,
			TOUCH_DOLLY_PAN: 5,
			TOUCH_DOLLY_ROTATE: 6
		};

		let state = STATE.NONE;

		const EPS = 0.000001;

		// current position in spherical coordinates
		const spherical = new Spherical();
		const sphericalDelta = new Spherical();

		let scale = 1;
		const panOffset = new Vector3();
		let zoomChanged = false;

		const rotateStart = new Vector2();
		const rotateEnd = new Vector2();
		const rotateDelta = new Vector2();

		const panStart = new Vector2();
		const panEnd = new Vector2();
		const panDelta = new Vector2();

		const dollyStart = new Vector2();
		const dollyEnd = new Vector2();
		const dollyDelta = new Vector2();

		const pointers = [];
		const pointerPositions = {};

		function getAutoRotationAngle() {

			return 2 * Math.PI / 60 / 60 * scope.autoRotateSpeed;

		}

		function getZoomScale() {

			return Math.pow( 0.95, scope.zoomSpeed );

		}

		function rotateLeft( angle ) {

			sphericalDelta.theta -= angle;

		}

		function rotateUp( angle ) {

			sphericalDelta.phi -= angle;

		}

		const panLeft = function () {

			const v = new Vector3();

			return function panLeft( distance, objectMatrix ) {

				v.setFromMatrixColumn( objectMatrix, 0 ); // get X column of objectMatrix
				v.multiplyScalar( - distance );

				panOffset.add( v );

			};

		}();

		const panUp = function () {

			const v = new Vector3();

			return function panUp( distance, objectMatrix ) {

				if ( scope.screenSpacePanning === true ) {

					v.setFromMatrixColumn( objectMatrix, 1 );

				} else {

					v.setFromMatrixColumn( objectMatrix, 0 );
					v.crossVectors( scope.object.up, v );

				}

				v.multiplyScalar( distance );

				panOffset.add( v );

			};

		}();

		// deltaX and deltaY are in pixels; right and down are positive
		const pan = function () {

			const offset = new Vector3();

			return function pan( deltaX, deltaY ) {

				const element = scope.domElement;

				if ( scope.object.isPerspectiveCamera ) {

					// perspective
					const position = scope.object.position;
					offset.copy( position ).sub( scope.target );
					let targetDistance = offset.length();

					// half of the fov is center to top of screen
					targetDistance *= Math.tan( ( scope.object.fov / 2 ) * Math.PI / 180.0 );

					// we use only clientHeight here so aspect ratio does not distort speed
					panLeft( 2 * deltaX * targetDistance / element.clientHeight, scope.object.matrix );
					panUp( 2 * deltaY * targetDistance / element.clientHeight, scope.object.matrix );

				} else if ( scope.object.isOrthographicCamera ) {

					// orthographic
					panLeft( deltaX * ( scope.object.right - scope.object.left ) / scope.object.zoom / element.clientWidth, scope.object.matrix );
					panUp( deltaY * ( scope.object.top - scope.object.bottom ) / scope.object.zoom / element.clientHeight, scope.object.matrix );

				} else {

					// camera neither orthographic nor perspective
					console.warn( 'WARNING: OrbitControls.js encountered an unknown camera type - pan disabled.' );
					scope.enablePan = false;

				}

			};

		}();

		function dollyOut( dollyScale ) {

			if ( scope.object.isPerspectiveCamera ) {

				scale /= dollyScale;

			} else if ( scope.object.isOrthographicCamera ) {

				scope.object.zoom = Math.max( scope.minZoom, Math.min( scope.maxZoom, scope.object.zoom * dollyScale ) );
				scope.object.updateProjectionMatrix();
				zoomChanged = true;

			} else {

				console.warn( 'WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled.' );
				scope.enableZoom = false;

			}

		}

		function dollyIn( dollyScale ) {

			if ( scope.object.isPerspectiveCamera ) {

				scale *= dollyScale;

			} else if ( scope.object.isOrthographicCamera ) {

				scope.object.zoom = Math.max( scope.minZoom, Math.min( scope.maxZoom, scope.object.zoom / dollyScale ) );
				scope.object.updateProjectionMatrix();
				zoomChanged = true;

			} else {

				console.warn( 'WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled.' );
				scope.enableZoom = false;

			}

		}

		//
		// event callbacks - update the object state
		//

		function handleMouseDownRotate( event ) {

			rotateStart.set( event.clientX, event.clientY );

		}

		function handleMouseDownDolly( event ) {

			dollyStart.set( event.clientX, event.clientY );

		}

		function handleMouseDownPan( event ) {

			panStart.set( event.clientX, event.clientY );

		}

		function handleMouseMoveRotate( event ) {

			rotateEnd.set( event.clientX, event.clientY );

			rotateDelta.subVectors( rotateEnd, rotateStart ).multiplyScalar( scope.rotateSpeed );

			const element = scope.domElement;

			rotateLeft( 2 * Math.PI * rotateDelta.x / element.clientHeight ); // yes, height

			rotateUp( 2 * Math.PI * rotateDelta.y / element.clientHeight );

			rotateStart.copy( rotateEnd );

			scope.update();

		}

		function handleMouseMoveDolly( event ) {

			dollyEnd.set( event.clientX, event.clientY );

			dollyDelta.subVectors( dollyEnd, dollyStart );

			if ( dollyDelta.y > 0 ) {

				dollyOut( getZoomScale() );

			} else if ( dollyDelta.y < 0 ) {

				dollyIn( getZoomScale() );

			}

			dollyStart.copy( dollyEnd );

			scope.update();

		}

		function handleMouseMovePan( event ) {

			panEnd.set( event.clientX, event.clientY );

			panDelta.subVectors( panEnd, panStart ).multiplyScalar( scope.panSpeed );

			pan( panDelta.x, panDelta.y );

			panStart.copy( panEnd );

			scope.update();

		}

		function handleMouseWheel( event ) {

			if ( event.deltaY < 0 ) {

				dollyIn( getZoomScale() );

			} else if ( event.deltaY > 0 ) {

				dollyOut( getZoomScale() );

			}

			scope.update();

		}

		function handleKeyDown( event ) {

			let needsUpdate = false;

			switch ( event.code ) {

				case scope.keys.UP:
					pan( 0, scope.keyPanSpeed );
					needsUpdate = true;
					break;

				case scope.keys.BOTTOM:
					pan( 0, - scope.keyPanSpeed );
					needsUpdate = true;
					break;

				case scope.keys.LEFT:
					pan( scope.keyPanSpeed, 0 );
					needsUpdate = true;
					break;

				case scope.keys.RIGHT:
					pan( - scope.keyPanSpeed, 0 );
					needsUpdate = true;
					break;

			}

			if ( needsUpdate ) {

				// prevent the browser from scrolling on cursor keys
				event.preventDefault();

				scope.update();

			}


		}

		function handleTouchStartRotate() {

			if ( pointers.length === 1 ) {

				rotateStart.set( pointers[ 0 ].pageX, pointers[ 0 ].pageY );

			} else {

				const x = 0.5 * ( pointers[ 0 ].pageX + pointers[ 1 ].pageX );
				const y = 0.5 * ( pointers[ 0 ].pageY + pointers[ 1 ].pageY );

				rotateStart.set( x, y );

			}

		}

		function handleTouchStartPan() {

			if ( pointers.length === 1 ) {

				panStart.set( pointers[ 0 ].pageX, pointers[ 0 ].pageY );

			} else {

				const x = 0.5 * ( pointers[ 0 ].pageX + pointers[ 1 ].pageX );
				const y = 0.5 * ( pointers[ 0 ].pageY + pointers[ 1 ].pageY );

				panStart.set( x, y );

			}

		}

		function handleTouchStartDolly() {

			const dx = pointers[ 0 ].pageX - pointers[ 1 ].pageX;
			const dy = pointers[ 0 ].pageY - pointers[ 1 ].pageY;

			const distance = Math.sqrt( dx * dx + dy * dy );

			dollyStart.set( 0, distance );

		}

		function handleTouchStartDollyPan() {

			if ( scope.enableZoom ) handleTouchStartDolly();

			if ( scope.enablePan ) handleTouchStartPan();

		}

		function handleTouchStartDollyRotate() {

			if ( scope.enableZoom ) handleTouchStartDolly();

			if ( scope.enableRotate ) handleTouchStartRotate();

		}

		function handleTouchMoveRotate( event ) {

			if ( pointers.length == 1 ) {

				rotateEnd.set( event.pageX, event.pageY );

			} else {

				const position = getSecondPointerPosition( event );

				const x = 0.5 * ( event.pageX + position.x );
				const y = 0.5 * ( event.pageY + position.y );

				rotateEnd.set( x, y );

			}

			rotateDelta.subVectors( rotateEnd, rotateStart ).multiplyScalar( scope.rotateSpeed );

			const element = scope.domElement;

			rotateLeft( 2 * Math.PI * rotateDelta.x / element.clientHeight ); // yes, height

			rotateUp( 2 * Math.PI * rotateDelta.y / element.clientHeight );

			rotateStart.copy( rotateEnd );

		}

		function handleTouchMovePan( event ) {

			if ( pointers.length === 1 ) {

				panEnd.set( event.pageX, event.pageY );

			} else {

				const position = getSecondPointerPosition( event );

				const x = 0.5 * ( event.pageX + position.x );
				const y = 0.5 * ( event.pageY + position.y );

				panEnd.set( x, y );

			}

			panDelta.subVectors( panEnd, panStart ).multiplyScalar( scope.panSpeed );

			pan( panDelta.x, panDelta.y );

			panStart.copy( panEnd );

		}

		function handleTouchMoveDolly( event ) {

			const position = getSecondPointerPosition( event );

			const dx = event.pageX - position.x;
			const dy = event.pageY - position.y;

			const distance = Math.sqrt( dx * dx + dy * dy );

			dollyEnd.set( 0, distance );

			dollyDelta.set( 0, Math.pow( dollyEnd.y / dollyStart.y, scope.zoomSpeed ) );

			dollyOut( dollyDelta.y );

			dollyStart.copy( dollyEnd );

		}

		function handleTouchMoveDollyPan( event ) {

			if ( scope.enableZoom ) handleTouchMoveDolly( event );

			if ( scope.enablePan ) handleTouchMovePan( event );

		}

		function handleTouchMoveDollyRotate( event ) {

			if ( scope.enableZoom ) handleTouchMoveDolly( event );

			if ( scope.enableRotate ) handleTouchMoveRotate( event );

		}

		//
		// event handlers - FSM: listen for events and reset state
		//

		function onPointerDown( event ) {

			if ( scope.enabled === false ) return;

			if ( pointers.length === 0 ) {

				scope.domElement.setPointerCapture( event.pointerId );

				scope.domElement.addEventListener( 'pointermove', onPointerMove );
				scope.domElement.addEventListener( 'pointerup', onPointerUp );

			}

			//

			addPointer( event );

			if ( event.pointerType === 'touch' ) {

				onTouchStart( event );

			} else {

				onMouseDown( event );

			}

		}

		function onPointerMove( event ) {

			if ( scope.enabled === false ) return;

			if ( event.pointerType === 'touch' ) {

				onTouchMove( event );

			} else {

				onMouseMove( event );

			}

		}

		function onPointerUp( event ) {

		    removePointer( event );

		    if ( pointers.length === 0 ) {

		        scope.domElement.releasePointerCapture( event.pointerId );

		        scope.domElement.removeEventListener( 'pointermove', onPointerMove );
		        scope.domElement.removeEventListener( 'pointerup', onPointerUp );

		    }

		    scope.dispatchEvent( _endEvent );

		    state = STATE.NONE;

		}

		function onPointerCancel( event ) {

			removePointer( event );

		}

		function onMouseDown( event ) {

			let mouseAction;

			switch ( event.button ) {

				case 0:

					mouseAction = scope.mouseButtons.LEFT;
					break;

				case 1:

					mouseAction = scope.mouseButtons.MIDDLE;
					break;

				case 2:

					mouseAction = scope.mouseButtons.RIGHT;
					break;

				default:

					mouseAction = - 1;

			}

			switch ( mouseAction ) {

				case MOUSE.DOLLY:

					if ( scope.enableZoom === false ) return;

					handleMouseDownDolly( event );

					state = STATE.DOLLY;

					break;

				case MOUSE.ROTATE:

					if ( event.ctrlKey || event.metaKey || event.shiftKey ) {

						if ( scope.enablePan === false ) return;

						handleMouseDownPan( event );

						state = STATE.PAN;

					} else {

						if ( scope.enableRotate === false ) return;

						handleMouseDownRotate( event );

						state = STATE.ROTATE;

					}

					break;

				case MOUSE.PAN:

					if ( event.ctrlKey || event.metaKey || event.shiftKey ) {

						if ( scope.enableRotate === false ) return;

						handleMouseDownRotate( event );

						state = STATE.ROTATE;

					} else {

						if ( scope.enablePan === false ) return;

						handleMouseDownPan( event );

						state = STATE.PAN;

					}

					break;

				default:

					state = STATE.NONE;

			}

			if ( state !== STATE.NONE ) {

				scope.dispatchEvent( _startEvent );

			}

		}

		function onMouseMove( event ) {

			if ( scope.enabled === false ) return;

			switch ( state ) {

				case STATE.ROTATE:

					if ( scope.enableRotate === false ) return;

					handleMouseMoveRotate( event );

					break;

				case STATE.DOLLY:

					if ( scope.enableZoom === false ) return;

					handleMouseMoveDolly( event );

					break;

				case STATE.PAN:

					if ( scope.enablePan === false ) return;

					handleMouseMovePan( event );

					break;

			}

		}

		function onMouseWheel( event ) {

			if ( scope.enabled === false || scope.enableZoom === false || state !== STATE.NONE ) return;

			event.preventDefault();

			scope.dispatchEvent( _startEvent );

			handleMouseWheel( event );

			scope.dispatchEvent( _endEvent );

		}

		function onKeyDown( event ) {

			if ( scope.enabled === false || scope.enablePan === false ) return;

			handleKeyDown( event );

		}

		function onTouchStart( event ) {

			trackPointer( event );

			switch ( pointers.length ) {

				case 1:

					switch ( scope.touches.ONE ) {

						case TOUCH.ROTATE:

							if ( scope.enableRotate === false ) return;

							handleTouchStartRotate();

							state = STATE.TOUCH_ROTATE;

							break;

						case TOUCH.PAN:

							if ( scope.enablePan === false ) return;

							handleTouchStartPan();

							state = STATE.TOUCH_PAN;

							break;

						default:

							state = STATE.NONE;

					}

					break;

				case 2:

					switch ( scope.touches.TWO ) {

						case TOUCH.DOLLY_PAN:

							if ( scope.enableZoom === false && scope.enablePan === false ) return;

							handleTouchStartDollyPan();

							state = STATE.TOUCH_DOLLY_PAN;

							break;

						case TOUCH.DOLLY_ROTATE:

							if ( scope.enableZoom === false && scope.enableRotate === false ) return;

							handleTouchStartDollyRotate();

							state = STATE.TOUCH_DOLLY_ROTATE;

							break;

						default:

							state = STATE.NONE;

					}

					break;

				default:

					state = STATE.NONE;

			}

			if ( state !== STATE.NONE ) {

				scope.dispatchEvent( _startEvent );

			}

		}

		function onTouchMove( event ) {

			trackPointer( event );

			switch ( state ) {

				case STATE.TOUCH_ROTATE:

					if ( scope.enableRotate === false ) return;

					handleTouchMoveRotate( event );

					scope.update();

					break;

				case STATE.TOUCH_PAN:

					if ( scope.enablePan === false ) return;

					handleTouchMovePan( event );

					scope.update();

					break;

				case STATE.TOUCH_DOLLY_PAN:

					if ( scope.enableZoom === false && scope.enablePan === false ) return;

					handleTouchMoveDollyPan( event );

					scope.update();

					break;

				case STATE.TOUCH_DOLLY_ROTATE:

					if ( scope.enableZoom === false && scope.enableRotate === false ) return;

					handleTouchMoveDollyRotate( event );

					scope.update();

					break;

				default:

					state = STATE.NONE;

			}

		}

		function onContextMenu( event ) {

			if ( scope.enabled === false ) return;

			event.preventDefault();

		}

		function addPointer( event ) {

			pointers.push( event );

		}

		function removePointer( event ) {

			delete pointerPositions[ event.pointerId ];

			for ( let i = 0; i < pointers.length; i ++ ) {

				if ( pointers[ i ].pointerId == event.pointerId ) {

					pointers.splice( i, 1 );
					return;

				}

			}

		}

		function trackPointer( event ) {

			let position = pointerPositions[ event.pointerId ];

			if ( position === undefined ) {

				position = new Vector2();
				pointerPositions[ event.pointerId ] = position;

			}

			position.set( event.pageX, event.pageY );

		}

		function getSecondPointerPosition( event ) {

			const pointer = ( event.pointerId === pointers[ 0 ].pointerId ) ? pointers[ 1 ] : pointers[ 0 ];

			return pointerPositions[ pointer.pointerId ];

		}

		//

		scope.domElement.addEventListener( 'contextmenu', onContextMenu );

		scope.domElement.addEventListener( 'pointerdown', onPointerDown );
		scope.domElement.addEventListener( 'pointercancel', onPointerCancel );
		scope.domElement.addEventListener( 'wheel', onMouseWheel, { passive: false } );

		// force an update at start

		this.update();

	}

}

// Scene Declartion

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
// This defines the initial distance of the camera, you may ignore this as the camera is expected to be dynamic
camera.applyMatrix4(new THREE.Matrix4().makeTranslation(-5, 3, 110));
camera.lookAt(0, -4, 1)


const renderer = new THREE.WebGLRenderer();
renderer.setSize( window.innerWidth, window.innerHeight );
document.body.appendChild( renderer.domElement );


// helper function for later on
function degrees_to_radians(degrees)
{
  var pi = Math.PI;
  return degrees * (pi/180);
}


// Here we load the cubemap and pitch images, you may change it

const loader = new THREE.CubeTextureLoader();
const texture = loader.load([
  'src/pitch/right.jpg',
  'src/pitch/left.jpg',
  'src/pitch/top.jpg',
  'src/pitch/bottom.jpg',
  'src/pitch/front.jpg',
  'src/pitch/back.jpg',
]);
scene.background = texture;



// We usually do the texture loading before we start everything else, as it might take processing time




function addLight() {
    // Ambient Light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5); // Soft white light
    scene.add(ambientLight);


    const startLight = new THREE.DirectionalLight(0xffffff, 1);
    startLight.position.set(0, 5, 0);
	  scene.add(startLight);

    const endLight = new THREE.DirectionalLight(0xffffff, 1);
    endLight.position.set(0, 5, -10);
    scene.add(endLight);
}


// You should copy-paste the goal from the previous exercise here
function createGoal() {

    const material = new THREE.MeshPhongMaterial({ color: 0xffffff });
    const ringMaterial = new THREE.MeshPhongMaterial({ color: 0xffffff });
    const netMaterial = new THREE.MeshPhongMaterial({
        color: 0xD3D3D3,
        side: THREE.DoubleSide,
        opacity: 0.5,
        transparent: true
    });
    // Create a group for the entire goal
    const goalGroup = new THREE.Group();

    // Crossbar
    const crossbarGeometry = new THREE.CylinderGeometry(0.1, 0.1, 6, 32);
    const crossbar = new THREE.Mesh(crossbarGeometry, material);
    crossbar.rotation.z = Math.PI / 2; // Rotate 90 degrees around Z-axis
    crossbar.position.set(0, 2, 0);
    goalGroup.add(crossbar);

    // Goalposts
    const postGeometry = new THREE.CylinderGeometry(0.1, 0.1, 2, 32);

    const leftPost = new THREE.Mesh(postGeometry, material);
    leftPost.position.set(-3, 1, 0);
    goalGroup.add(leftPost);

    const rightPost = new THREE.Mesh(postGeometry, material);
    rightPost.position.set(3, 1, 0);
    goalGroup.add(rightPost);

    // Back supports
    const backSupportGeometry = new THREE.CylinderGeometry(0.1, 0.1, 2.83, 32);

    const leftBackSupport = new THREE.Mesh(backSupportGeometry, material);
    leftBackSupport.rotation.x = Math.PI / 4; // Rotate 45 degrees around X-axis
    leftBackSupport.position.set(-3, 1, -1.0);
    goalGroup.add(leftBackSupport);

    const rightBackSupport = new THREE.Mesh(backSupportGeometry, material);
    rightBackSupport.rotation.x = Math.PI / 4; // Rotate 45 degrees around X-axis
    rightBackSupport.position.set(3, 1, -1.0);
    goalGroup.add(rightBackSupport);

    // Spheres at connections
    const sphereGeometry = new THREE.SphereGeometry(0.1, 32, 32);

    const leftSphere = new THREE.Mesh(sphereGeometry, material);
    leftSphere.position.set(-3, 2, 0);
    goalGroup.add(leftSphere);

    const rightSphere = new THREE.Mesh(sphereGeometry, material);
    rightSphere.position.set(3, 2, 0);
    goalGroup.add(rightSphere);

    // Torus rings
    const ringGeometry = new THREE.TorusGeometry(0.1, 0.1, 8, 100);

    const leftRing = new THREE.Mesh(ringGeometry, ringMaterial);
    leftRing.rotation.x = Math.PI / 2; // Rotate 90 degrees around X-axis
    leftRing.position.set(-3, 0, 0);
    goalGroup.add(leftRing);

    const rightRing = new THREE.Mesh(ringGeometry, ringMaterial);
    rightRing.rotation.x = Math.PI / 2; // Rotate 90 degrees around X-axis
    rightRing.position.set(3, 0, 0);
    goalGroup.add(rightRing);

    const backLeftRing = new THREE.Mesh(ringGeometry, ringMaterial);
    backLeftRing.rotation.x = Math.PI / 2; // Rotate 90 degrees around X-axis
    backLeftRing.position.set(-3, 0, -2);
    goalGroup.add(backLeftRing);

    const backRightRing = new THREE.Mesh(ringGeometry, ringMaterial);
    backRightRing.rotation.x = Math.PI / 2; // Rotate 90 degrees around X-axis
    backRightRing.position.set(3, 0, -2);
    goalGroup.add(backRightRing);

    // Nets
    const backNetGeometry = new THREE.PlaneGeometry(6, 2.84);
    const backNet = new THREE.Mesh(backNetGeometry, netMaterial);
    backNet.rotation.x = Math.PI / 4; // Rotate 45 degrees around X-axis
    backNet.position.set(0, 1, -1);
    goalGroup.add(backNet);

    // Left triangular net
    const leftNetVertices = new Float32Array([
        -3, 2, 0,    // Top vertex
        -3, 0, 0,    // Bottom front vertex
        -3, 0, -2    // Bottom back vertex
    ]);
    const leftNetGeometry = new THREE.BufferGeometry();
    leftNetGeometry.setAttribute('position', new THREE.BufferAttribute(leftNetVertices, 3));
    const leftNet = new THREE.Mesh(leftNetGeometry, netMaterial);
    goalGroup.add(leftNet);

    // Right triangular net
    const rightNetVertices = new Float32Array([
        3, 2, 0,    // Top vertex
        3, 0, 0,    // Bottom front vertex
        3, 0, -2    // Bottom back vertex
    ]);
    const rightNetGeometry = new THREE.BufferGeometry();
    rightNetGeometry.setAttribute('position', new THREE.BufferAttribute(rightNetVertices, 3));
    const rightNet = new THREE.Mesh(rightNetGeometry, netMaterial);
    goalGroup.add(rightNet);

    goalGroup.scale.set(3, 3, 3);

    const goalTranslation = new THREE.Matrix4().makeTranslation(0, 0,80);
    goalGroup.applyMatrix4(goalTranslation);

    // Add the goal group to the scene
    scene.add(goalGroup);
}

function createBall() {
    const textureLoader = new THREE.TextureLoader();
    const texture = textureLoader.load('src/textures/soccer_ball.jpg');

    const ballGeometry = new THREE.SphereGeometry(0.25, 32, 32);
    const ballMaterial = new THREE.MeshPhongMaterial({ map: texture });
    const ball = new THREE.Mesh(ballGeometry, ballMaterial);

    let ballMatrix = new THREE.Matrix4().makeTranslation(0, 0, 6); // Twice as far from the goal
    ball.applyMatrix4(ballMatrix);
    ball.scale.set(3, 3, 3);

    const ballTranslation = new THREE.Matrix4().makeTranslation(0, 0, 160); // Move further back
    ball.applyMatrix4(ballTranslation);

    return ball;
}





// Define the initial position of the ball based on its creation
const initialBallPosition = new THREE.Vector3(0, 0, 166);

const rightWingerRoute = new THREE.QuadraticBezierCurve3(
    initialBallPosition,
    new THREE.Vector3(50, 0, 120),  // Wider and less sharp control point
    new THREE.Vector3(0, 0, 80)     // End point inside the goal
);

const centerForwardRoute = new THREE.QuadraticBezierCurve3(
    initialBallPosition,
    new THREE.Vector3(0, 50, 120),  // Wider and less sharp control point
    new THREE.Vector3(0, 0, 80)     // End point inside the goal
);

const leftWingerRoute = new THREE.QuadraticBezierCurve3(
    initialBallPosition,
    new THREE.Vector3(-50, 0, 120), // Wider and less sharp control point
    new THREE.Vector3(0, 0, 80)     // End point inside the goal
);

let currentRoute = centerForwardRoute;
let t = 0;
const increment = 1 / 500;


const cameraTranslate = new THREE.Matrix4();
cameraTranslate.makeTranslation(0, 0, 5);
camera.applyMatrix4(cameraTranslate);



class Card {
    constructor(curve, t, texturePath, type) {
        this.curve = curve;
        this.t = t;
        this.type = type; // 'yellow' or 'red'

        const textureLoader = new THREE.TextureLoader();
        const texture = textureLoader.load(texturePath);
        const cardGeometry = new THREE.PlaneGeometry(1, 1.5);
        const cardMaterial = new THREE.MeshPhongMaterial({ map: texture, side: THREE.DoubleSide });
        this.object3D = new THREE.Mesh(cardGeometry, cardMaterial);

        // Position the card at the specific point on the curve
        const position = curve.getPoint(t);
        this.object3D.position.set(position.x, position.y, position.z);

        // Rotate the card to face the camera (optional)
        this.object3D.rotation.y = Math.PI; // Adjust as needed to face the camera

        // Scale the card uniformly to twice its size
        this.object3D.scale.set(2, 2, 2);
    }
}


const cards = []; // List to hold all cards

function addCardsToCurve(curve, texturePath, tValues, type) {
    tValues.forEach(t => {
        const card = new Card(curve, t, texturePath, type);
        cards.push(card);
        scene.add(card.object3D);
    });
    cards.sort((a, b) => a.t - b.t); // Ensure the cards list is sorted by t value
}

// Add cards to each curve with different textures and different t values
addCardsToCurve(rightWingerRoute, 'src/textures/yellow_card.jpg', [0.2, 0.5], 'yellow');
addCardsToCurve(centerForwardRoute, 'src/textures/red_card.jpg', [0.3, 0.6], 'red');
addCardsToCurve(leftWingerRoute, 'src/textures/yellow_card.jpg', [0.25, 0.55], 'yellow');


// We wrote some of the function for you
const handle_keydown = (e) => {
    const currentPoint = new THREE.Vector3(ball.position.x, ball.position.y, ball.position.z);
    const closestT = findClosestT(currentRoute, currentPoint);

    if (e.code === 'ArrowLeft') {
        if (currentRoute === centerForwardRoute) {
            currentRoute = leftWingerRoute;
        } else if (currentRoute === rightWingerRoute) {
            currentRoute = centerForwardRoute;
        }
    } else if (e.code === 'ArrowRight') {
        if (currentRoute === centerForwardRoute) {
            currentRoute = rightWingerRoute;
        } else if (currentRoute === leftWingerRoute) {
            currentRoute = centerForwardRoute;
        }
    }

    // Map the current t value to the new route
    const newPoint = currentRoute.getPoint(closestT);
    ball.position.set(newPoint.x, newPoint.y, newPoint.z);
    t = closestT; // Set t to the mapped t value
};


function findClosestT(curve, point) {
    let closestT = 0;
    let closestDistance = Infinity;
    for (let i = 0; i <= 1; i += 0.001) {
        const curvePoint = curve.getPoint(i);
        const distance = point.distanceTo(curvePoint);
        if (distance < closestDistance) {
            closestDistance = distance;
            closestT = i;
        }
    }
    return closestT;
}

document.addEventListener('keydown', handle_keydown);

addLight();
createGoal();
let ball = createBall();
scene.add(ball);
renderer.render(scene, camera);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 80); // Set the center to the goal position
controls.update();
let isOrbitEnabled = true;
const toggleOrbit = (e) => {
    if (e.key === "o") {
        isOrbitEnabled = !isOrbitEnabled;
    }
};

document.addEventListener('keydown', toggleOrbit);

//coliision detection
let score = 100;
let yellowCardCollisions = 0;
let redCardCollisions = 0;

function checkCollisions() {
    const ballPosition = ball.position;
    const ballBoundingBox = new THREE.Box3().setFromObject(ball);

    for (let card of cards) {
        if (card.curve === currentRoute && Math.abs(card.t - t) < 0.01 && card.object3D.visible) {
            const cardBoundingBox = new THREE.Box3().setFromObject(card.object3D);
            if (ballBoundingBox.intersectsBox(cardBoundingBox)) {
                card.object3D.visible = false;
                if (card.type === 'yellow') {
                    yellowCardCollisions++;
                } else if (card.type === 'red') {
                    redCardCollisions++;
                }
                updateScore();
            }
        }
    }
}

function updateScore() {
    score = 100 * Math.pow(2, -(yellowCardCollisions + redCardCollisions * 10) / 10);
}

function showFinalScore() {
    alert(`Fair Play Score: ${score.toFixed(2)}`);
}


function animate() {
    requestAnimationFrame(animate);
    controls.enabled = isOrbitEnabled;

    // Animation for the ball's position
    const point = currentRoute.getPoint(t);
    ball.position.set(point.x, point.y, point.z);

    // Make the ball spin
    ball.rotation.x += 0.05;
    ball.rotation.y += 0.05;

    // Increment t
    t += increment;
    if (t > 1) {
        t = 0; // Loop the animation
        showFinalScore(); // Show the score when the ball reaches the goal
    }

    // Check for collisions
    checkCollisions();

    // Update camera position to follow the ball
    camera.position.z = ball.position.z + 30; // Adjust the distance as needed
    controls.target.set(0, 1, 80); // Keep the target fixed on the goal
    controls.update();

    // Render the scene
    renderer.render(scene, camera);
}

animate()