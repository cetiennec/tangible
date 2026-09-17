@chapter(Introduction)

@cue(label.motors = false) @cue(label.angles = false) @cue(label.links = false) @cue(label.tip = false) @cue(label.dof = false)
Today we will discuss Forward and Inverse Kinematics on robots, which is the art of switching between the joint and the Cartesian space. You'll be able to play with the simulation while I speak and pause to ask questions.

@pause(prompt: "Turn both joints and watch where the tip goes.")

First, look at our robot, it has 2 @cue(label.links = true) links and 2 @cue(label.motors = true) motors that can move the @cue(label.angles = true) angles q1 and q2, it is thus said to be 2 @cue(label.dof = true) degrees of freedom or 2 DOF.

The tip of the robot is called the @cue(label.tip = true) end-effector.

See that @cue(q1 -> 2.4, over: 1.8s) @cue(q2 -> -2.083, over: 2.4s) changing the angles between 0 and 2pi directly affects end-effector position in (x,y) plane. 
This means that there exists a @board(fkx: $x = L_1 \cos q_1 + L_2 \cos(q_1+q_2)$) @board(fky: $y = L_1 \sin q_1 + L_2 \sin(q_1+q_2)$) mapping between radians and centimeters.

The relation between angles and end-effector position is called the @board(fk: $x = f(\theta)$) Forward Kinematics or FK.

@clear(board)
@cue(label.angles = false) @cue(label.links = false) @cue(label.tip = false)
For serial robots, like ours, it can be obtained by modeling each joint position.
For instance, @board(p1: $p_1 = (0,\ 0)$) motor 1 is at the base (0,0).
But motor 2 position @cue(q1 -> 1.2, over: 2s) @cue(label.angles = true) @cue(label.links = true) @board(p2: $p_2 = L_1(\cos q_1,\ \sin q_1)$) depends on motor 1 angle.
And @cue(label.tip = true) @board(p3: $p_3 = p_2 + L_2(\cos(q_1{+}q_2),\ \sin(q_1{+}q_2))$) end-effector position on motor 2 position and angle.

@clear(board)
With this we have the full relation that gives @board(fkx: $x = L_1 \cos q_1 + L_2 \cos(q_1+q_2)$) @board(fky: $y = L_1 \sin q_1 + L_2 \sin(q_1+q_2)$) angle to position.


But when thinking of a trajectory, as humans, we think of the trajectory in the Cartesian space, for instance, @cue(show.circle = true) drawing a circle will give the following @board(circx: $x(t) = x_c + r\cos t$) @board(circy: $y(t) = y_c + r\sin t$) (x,y) equation: 

But this does not tell us what motor action we should apply to the robot to make it follow this circle.

This is where the inverse kinematics (or IK) problem comes in.
@clear(board)
IK is @board(ik: $\theta = f^{-1}(x)$) the inverse relationship of FK.

@cue(show.circle = false)
And this does not always have a unique solution or even a solution.

Pause and think a bit about cases where the number of solutions could be 0?

@pause(prompt: "When can the arm not reach a point at all?", speak: false)

For our 2 DOF robot, we either have 0 or 2 solutions.

We have @cue(show.unreachable = true) 0 solutions outside of the @cue(show.workspace = true) reachable space, which is all the points that the end-effector can reach.

@cue(show.unreachable = false)
Of course this reachable space @cue(l2 -> 4, over: 2.5s) depends on the length of the links. Pause and play with the link lengths to see how the reachable space evolve.

@pause(prompt: "Move both link lengths and watch the reachable space change shape.", speak: false)

Let's assume L2 can never be longer than L1, so that the forearm does not hit the ground.

What value of L2 would give the largest reachable space according to you?

@pause(prompt: "Pick your answer before we plot it.", speak: false)

@cue(show.areaSurface = true)
Yeah, this is actually @cue(l1 -> 12, over: 2s) @cue(l2 -> 12, over: 2s) L1=L2, have you seen this somewhere?

Look at your arms, this is actually a feature human arms have.

@cue(show.areaSurface = false)
Getting back to the IK problem, how could there be multiple solutions? In our case, 2? Try to reach a point in 2 different ways.

@pause(prompt: "Drag the end-effector to a point, then use the flip button to reach it the other way.", speak: false)

@cue(q1 -> 0.55, over: 1.5s) @cue(q2 -> 1.5, over: 1.5s) Each position within the reachable space is reachable, in 2 ways. The elbow of the robot can either be up or @cue(q1 -> 2.05, over: 1.5s) @cue(q2 -> -1.500, over: 1.5s) down leading to 2 solutions, this gives a different orientation of the gripper and is not fully equivalent in our case.

@scene(redundant)
If the robot has more degrees of freedom than the space, the number of @cue(spread -> 0.92, over: 2.4s) solutions can actually go to infinity.

@pause(prompt: "Flex the arm with the slider. The tip never leaves the target.", speak: false)

@scene(planar)
The solution for the IK can sometimes be found analytically.

@clear(board)
In the 2 DOF example, one can invert the equations of the FK with a bit of maths, leading to the following @board(ikq2: $q_2 = \htmlClass{sign}{\pm}\arccos\left(\frac{x^2+y^2-L_1^2-L_2^2}{2L_1L_2}\right)$) @board(ikq1: $q_1 = \mathrm{atan2}(y,x) - \mathrm{atan2}(L_2\sin q_2,\, L_1+L_2\cos q_2)$) equations.

The 2 elbow configurations depend on the @highlight(ikq2.sign) sign in front of the acos function.

If the solution is not found analytically, or if there exists an infinity of solutions, we use numerical methods to approach the solution, @clear(board)
the best known is Newton's iterative method, in which we repeat the following @board(newton: $\theta_{k+1} = \theta_k + J^{-1}(\theta_k)\left(x^{*} - f(\theta_k)\right)$) sequence until convergence.

@clear(board)
OK, so now we fully know our robot's FK and IK, we can make it @cue(show.circle = true) draw a circle!

@bake(circle, steps: 32, over: 7s)
From the equation of the @board(circx: $x(t) = x_c + r\cos t$) @board(circy: $y(t) = y_c + r\sin t$) circle with regard to time t, we know x and y, and obtain q1 and q2 for this.

Now think about LeRobot, when is IK used?

@clear(board)
@scene(so101)
@cue(lift -> -0.75) @cue(elbow -> 1.35) @cue(wristFlex -> 0.45) @cue(gripper -> 0.5)
This actually depends on the teleoperator. Here is the SO-101 follower arm.

@cue(teleop = phone)
@cue(pan -> 0.7, over: 2.5s) @cue(lift -> -0.35, over: 2.5s) @cue(elbow -> 0.95, over: 2.5s)
If we use the phone as teleoperator, then we need IK.

@cue(teleop = leader)
@cue(show.leader = true)
@camera(distance: 1.05, over: 2s)
@cue(pan -> -0.6, over: 3s) @cue(lift -> -1.0, over: 3s) @cue(elbow -> 1.5, over: 3s) @cue(wristRoll -> 1.1, over: 3s)
But if we use another arm, let's say the SO-101 leader, the follower just has to copy-paste the joint angles directly, we say that planning is made in the joint space.

@clear(board)
@board(later: "Coming in a later series")
Classical robotics has focused on planning in the Cartesian space, but most of the recent @board(t1: "Vision Language Action models") Vision Language Action models, core of the @board(t2: "Imitation learning") imitation learning for vision, directly output joint goal positions.

Will this be transferable to every robot?

Most of them use an @board(t3: "Action experts") action expert separately from the VLA itself, which can be fine-tuned on any robot.
