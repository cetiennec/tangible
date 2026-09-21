@chapter(Introduction)

@cue(label.motors = false) @cue(label.angles = false) @cue(label.links = false) @cue(label.tip = false) @cue(label.dof = false)
Today we will discuss how robots are controlled. We'll first present Forward and Inverse Kinematics, which is the art of switching between the joint and the Cartesian space. Then, w'e'll study the case of imitation learning and take as an example LeRobot library from HuggingFace. You'll be able to play with the simulation while I speak and pause to ask questions.

First, look at our robot, it has 2 @cue(label.links = true) links and 2 @cue(label.motors = true) motors that can move their @cue(label.angles = true) angles q1 and q2, the robot is thus said to be 2 @cue(label.dof = true) @board(kwDof: "2 degrees of freedom (DOF)") degrees of freedom or 2 DOF.

The tip of the robot is called the @cue(label.tip = true) @board(kwEnd: "End-effector") end-effector.

See that @cue(q1 -> 2.4, over: 1.8s) @cue(q2 -> -2.083, over: 2.4s) changing the angles between 0 and 2pi directly affects end-effector position in (x,y) plane. 
@clear(board)
This means that there exists a mapping @board(fk: $x = f(\theta)$) between radians and centimeters.

@pause(prompt: "Turn q1 and q2 on the right, and watch the end-effector move.", speak: false)


The relation between angles and end-effector position is called the @board(kwFk: "Forward Kinematics (FK)") @board(fk: $x = f(\theta)$) Forward Kinematics or FK.

@cue(label.angles = false) @cue(label.links = false) @cue(label.tip = false)
For serial robots, like ours, it can be obtained by modeling each joint position.
For instance, @board(p1: $p_1 = (0,\ 0)$) motor 1 is at the base (0,0).
But motor 2 position @cue(q1 -> 1.2, over: 2s) @cue(label.angles = true) @cue(label.links = true) @board(p2: $p_2 = L_1(\cos q_1,\ \sin q_1)$) depends on motor 1 angle.
And @cue(label.tip = true) @board(p3: $p_3 = p_2 + L_2(\cos(q_1{+}q_2),\ \sin(q_1{+}q_2))$) end-effector position on motor 2 position and angle.

@clear(board)
With this we have the full relation that gives @board(fkx: $x = L_1 \cos q_1 + L_2 \cos(q_1+q_2)$) @board(fky: $y = L_1 \sin q_1 + L_2 \sin(q_1+q_2)$) angle to position.


But when thinking of a trajectory, as humans, we think of the trajectory in the Cartesian space x,y,z , for instance, @cue(show.circle = true) drawing a circle around a position (x_c,y_c) will give the following @board(circx: $x(t) = x_c + r\cos t$) @board(circy: $y(t) = y_c + r\sin t$)  equation: 

But from this, one needs to find what motor action we should apply to the robot to make it follow this circle.

This is where the inverse kinematics (or IK) problem comes in.
@clear(board)
IK is @board(kwIk: "Inverse Kinematics (IK)") @board(ik: $\theta = f^{-1}(x)$) the inverse relationship of FK.

@cue(show.circle = false)
And this function does not always have a unique solution or even a solution.

Pause and think a bit about cases where the number of solutions could be 0?

@pause(prompt: "When can the arm not reach a point at all?", speak: false)

@clear(kwIk)
@clear(ik)
For our 2 DOF robot, we either have @cue(show.workspace = true) 0 or 2 solutions in the general case, and sometimes 1 solution if we consider joint limits.

We have @cue(show.unreachable = true) 0 solutions outside of the @board(kwReach: "Reachable space") reachable space, which is all the points that the end-effector can reach. In our case, this space is a ring around the base.

@cue(show.unreachable = false)
Of course the area and shape of this reachable space @cue(l2 -> 4, over: 2.5s) depend on the length of the links. Pause and play with the link lengths to see how the reachable space evolve.

@pause(prompt: "Move both link lengths and watch the reachable space change shape.", speak: false)

@clear(kwReach)
The larger the links the bigger the area. But there is a relationship between L1 and L2 that allows the robot to reach both close and farther places.
What value of L2 would let the robot reach closest to itself, according to you?

@pause(prompt: "Pick your answer before we plot it.", speak: false)

@cue(show.areaSurface = true)
Yeah, this is actually @cue(l1 -> 12, over: 4s) @cue(l2 -> 12, over: 4s) L1=L2.

The surface peaks along the diagonal, where the two links have the same length. Equal links are what close the blind spot near the base.

<!-- @pause(prompt: "Read the surface: the ridge runs along L1 = L2.", speak: false) -->

Have you seen this somewhere?

@cue(show.human = true)
Look at your arms, your upper arm and your forearm are close to the same length, which is what lets your hand reach your own shoulder as easily as it reaches out in front of you.

@pause(prompt: "Compare your own upper arm and forearm.", speak: false)

@cue(show.human = false)
@cue(show.areaSurface = false)
Getting back to the IK problem, how could there be multiple solutions? Try to reach a point in 2 different ways.

@pause(prompt: "Drag the end-effector to a point, then use the flip button to reach it the other way.", speak: false)

@cue(q1 -> 0.55, over: 1.5s) @cue(q2 -> 1.5, over: 1.5s) Each position within the @cue(show.solutions = true) reachable space is reachable, in 2 ways. The elbow of the robot can either be up or @cue(q1 -> 2.05, over: 1.5s) @cue(q2 -> -1.500, over: 1.5s) down leading to 2 solutions, this gives a different orientation of the gripper and is not fully equivalent in our case.

@cue(show.solutions = false)
We've worked in the case where q1 and q2 can take any angle value. But in real life, joints have physical limitations, called @cue(show.limits = true) @board(kwLimits: "joint limits") joint limits. The reachable space is no longer a ring here.

Indeed, a real system cannot spin freely for ever. Here q1 is allowed to turn between 0.25 and 2.85 radians, and q2 between minus 2.6 and 1.15, and those two bounds alone carve the ring down to this shape.

@pause(prompt: "Move q1 and q2 and watch where the arm refuses to go.", speak: false)

Joint limits create a less straightforward answer to our earlier question. Take this point, which the arm can still reach in two different ways.

@cue(q1 -> 1.779, over: 2s) @cue(q2 -> -1.030, over: 2s) Elbow up, the arm folds over the top.

@cue(q1 -> 0.749, over: 2s) @cue(q2 -> 1.030, over: 2s) Elbow down, it comes round underneath.

<!-- @pause(prompt: "Both elbow solutions are legal here.", speak: false) -->

Now move the target out to the right, and one of the two answers disappears.

@cue(q1 -> 1.422, over: 2s) @cue(q2 -> -1.424, over: 2s) Elbow up still works. Elbow down would need q1 near zero and q2 above 1.4, and both of those are past the stops, so the arm simply cannot get there that way.

This is why limits matter so much in practice. Across this whole ring, @cue(show.solutions = true) only a small part keeps both solutions, about one point in ten. These are the kind of points that do. Most points keep just one, and a good half of the ring is lost altogether.

@pause(prompt: "Every marked point can be reached with the elbow either way.", speak: false)

@cue(show.solutions = false)
@scene(redundant)
If the robot @cue(spread -> 0.9, over: 0.7s) has more degrees @cue(spread -> 0.2, over: 0.7s) of freedom than the @cue(spread -> 0.75, over: 0.7s) space, the number of @cue(spread -> 0.35, over: 0.7s) solutions can actually go to infinity.

Look to these two examples : One 3 DOF arm in 2D and one 4 DOF in 3D.@cue(spread -> 0.1, over: 3.4s) 

Flex the arm with the slider. The tip never leaves the target, showing that there is an infinite number of solutions to the IK problem, especially if we don't consider end-effector angle.

@pause(prompt: "Flex the arm with the slider. The tip never leaves the target.", speak: false)

@scene(planar)
The solution for the IK can sometimes be found analytically.

@clear(board)
In the 2 DOF example, one can invert the equations of the FK with a bit of maths, leading to the following @board(ikq2: $q_2 = \htmlClass{sign}{\pm}\arccos\left(\frac{x^2+y^2-L_1^2-L_2^2}{2L_1L_2}\right)$) @board(ikq1: $q_1 = \mathrm{atan2}(y,x) - \mathrm{atan2}(L_2\sin q_2,\, L_1+L_2\cos q_2)$) equations.

The 2 elbow configurations depend on the @highlight(ikq2.sign) sign in front of the acos function.

If the solution is not found analytically, or if there exists an infinity of solutions, we use numerical methods to approach the solution, @clear(board)
the best known is @board(kwNewton: "Newton's method") Newton's iterative method, in which we repeat the following @board(newton: $\theta_{k+1} = \theta_k + J^{-1}(\theta_k)\left(x^{*} - f(\theta_k)\right)$) sequence until convergence.

@cue(show.jacobian = true) The J in there is the Jacobian, the matrix @cue(q1 -> 1.9, over: 0.7s) @cue(q2 -> -0.6, over: 0.7s) of partial derivatives that says @cue(q1 -> 0.9, over: 0.7s) @cue(q2 -> -1.9, over: 0.7s) how a small turn of @cue(q1 -> 1.7, over: 0.7s) @cue(q2 -> -0.3, over: 0.7s) each joint nudges @cue(q1 -> 1.422, over: 0.7s) @cue(q2 -> -1.424, over: 0.7s) the tip in x and y — watch the arrows move to a new spot each time. Turning q1 alone swings the tip around the base; turning q2 alone swings it around the elbow.

@cue(show.jacobian = false)

@clear(board)
@cue(q1 -> 1.423, over: 2s) @cue(q2 -> -1.708, over: 2s) OK, so now we fully know our robot's FK and IK, we can make it @cue(show.circle = true) draw a circle!

@bake(circle, steps: 32, over: 7s)
From the equation of the @board(circx: $x(t) = x_c + r\cos t$) @board(circy: $y(t) = y_c + r\sin t$) circle with regard to time t, we know x and y, and obtain q1 and q2 for this.

It's not enough that the start and the end are reachable: every point along the way needs a solution too, and the same elbow branch has to hold the whole time, or the arm would have to jump partway through.

And it's not just circles either.

@cue(show.circle = false) @cue(q1 -> 1.368, over: 2s) @cue(q2 -> -0.655, over: 2s) @cue(show.wave = true) Any continuous path works the same way, as long as the whole thing @bake(wave, steps: 32, over: 6s) stays reachable, one elbow branch at a time.

Same equations, same idea — just applied to a curve that isn't a circle.

@cue(show.wave = false)
@clear(board)
@scene(so101)
@cue(show.brand = true)
Now let's talk about @board(kwLerobot: "LeRobot") LeRobot which is Hugging Face library for Physical AI and Imitation learning. How is all of this being used?

@cue(diagram = workflow1) You've already seen three of its pieces without the name: the @board(lrRobot: "Robot descriptions") robot description that built this arm, the @board(lrTeleop: "Teleoperation") leader-follower teleoperation you're about to try, and the @board(lrData: "Datasets") dataset format that records it all.

@pause(prompt: "Take a look at the workflow. We'll come back to the arm next.", speak: false)

@cue(diagram = none)
@cue(show.brand = false)
@clear(board)
@cue(lift -> -0.75) @cue(elbow -> 1.35) @cue(wristFlex -> 0.45) @cue(gripper -> 0.5)
This actually depends on the teleoperator. Here is the SO-101 follower arm.

@cue(show.parts = true)
From base to tip: shoulder pan, shoulder lift, elbow, wrist flex, wrist roll, and the gripper.

@pause(prompt: "Match each label to the joint it names.", speak: false)

@cue(show.parts = false)
Teleoperation just means a person drives the robot in real time, and the way they drive it decides whether we need inverse kinematics at all.

There are broadly two ways to do it. Either you say where you want the gripper to be, as a position in space, or you say what angle each joint should hold. The first is planning in the Cartesian space, the second in the joint space.

Only the first one needs IK, because only the first one hands the robot a position and asks it to find the angles.

@pause(prompt: "Which way would you drive this arm?", speak: false)

@cue(teleop = phone)
@cue(pan -> 0.7, over: 2.5s) @cue(lift -> -0.35, over: 2.5s) @cue(elbow -> 0.95, over: 2.5s)
If we use the phone as teleoperator, then we need IK.

@cue(teleop = leader)
@cue(show.leader = true)
@camera(distance: 1.05, over: 2s)
@cue(pan -> -0.6, over: 3s) @cue(lift -> -1.0, over: 3s) @cue(elbow -> 1.5, over: 3s) @cue(wristRoll -> 1.1, over: 3s)
But if we use another arm, let's say the SO-101 leader, the follower just has to copy-paste the joint angles directly, we say that planning is made in the joint space.

@cue(show.angles = true)
Every angle is mimicked, one for one, and since both arms are the same shape, anything the leader can hold the follower can hold too.

Look at the two arms side by side. The shoulder angle on the leader is the shoulder angle on the follower, the elbow matches the elbow, and no equation is solved anywhere in between.

That is the whole appeal of teleoperating in the joint space. It is a copy, not a calculation, so it cannot fail to find a solution and it cannot pick the wrong elbow.

@pause(prompt: "Compare each joint on the leader with the same joint on the follower.", speak: false)

@cue(show.angles = false)
@cue(pan -> -0.55, over: 2s) @cue(lift -> -0.45, over: 2s) @cue(elbow -> 0.95, over: 2s) @cue(wristFlex -> 0.35, over: 2s) @cue(wristRoll -> 0, over: 2s) @cue(gripper -> 1.25, over: 2s) Let's watch them work through a real task together.

@cue(show.task = true)
@cue(task -> 1, over: 13s)
This is also how a dataset gets recorded. A person teleoperates the arms through a task, again and again, and every run is kept.

Here the pair move a brick from one spot to another, watched the whole time by a camera fixed on the workspace, like the one in the corner there.

Each demonstration is a stream of joint angles alongside that video, recorded frame for frame together, and that is what the robot learns from. Here's the elbow's own angle, traced live as the task plays — leader and follower, almost on top of each other, the follower just a beat behind.

@cue(show.task = false)
@clear(board)
@cue(show.brand = true)
@cue(diagram = workflow2)
Classical robotics has focused on planning in the Cartesian space, but most of the recent Vision Language Action models, core of imitation learning for vision, directly output joint goal positions.

Will this be transferable to every robot?

Most of them use an action expert separately from the VLA itself, which can be fine-tuned on any robot. That's the rest of this workflow — coming in a later series.

@cue(diagram = none)
@cue(show.brand = false)
