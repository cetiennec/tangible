@chapter(Introduction)

Today we will discuss Forward and Inverse Kinematics on robots, which is the art of working between the joint and the Cartesian space. You'll be able to play with the simulation while I speak and pause to ask questions.


@pause(prompt: "Turn both joints and watch where the tip goes.")

First look at our robot, the robot is said to be 2 degrees of freedom or 2 DOF, it has 2 links and 2 motors that can move the angles q1 and q2.

The tip of the robot is called the end-effector.

See that @cue(q1 -> 2.4, over: 1.8s) @cue(q2 -> 5.2, over: 2.4s) changing the angles between 0 and 2pi directly affects end-effector position in (x,y) plane. So there exists a @board(fkx: $x = L_1 \cos q_1 + L_2 \cos(q_1+q_2)$) @board(fky: $y = L_1 \sin q_1 + L_2 \sin(q_1+q_2)$) mapping between radians and cm.

The relation between angles and end-effector position is called the @board(fk: $x = f(\theta)$) Forward Kinematics or FK.

For serial robots, like ours, it can be obtained by modeling each joint position.
For instance, motor 1 is at the base (0,0).
But motor 2 position @cue(q1 -> 1.2, over: 2s) depends on motor 1 angle.
And end-effector position on motor 2 position and angle.

With this we have the full relation that gives angle to position.


But when thinking of a trajectory, as humans, we think of the trajectory in the Cartesian space, for instance, drawing a circle will give the following (x,y) equation : ..

But this does not tell us what motor action we should apply to the robot.

This is where the inverse kinematics (or IK) problem comes in.
@clear(board)
IK is @board(ik: $\theta = f^{-1}(x)$) the inverse relationship of FK.

And this does not always have a solution or even a unique solution.

Pause and think a bit about cases where the number of solutions could be 0?

@pause(prompt: "When can the arm not reach a point at all?", speak: false)

For our 2 DOF robot, we either have 0 or 2 solutions.

We have 0 solutions outside of the @cue(show.workspace = true) reachable space, which is all the points that the end-effector can reach.

Of course this reachable space @cue(l2 -> 11.5, over: 2.5s) depends on the length of the links. Pause and play with the link lengths.

@pause(prompt: "Move both link lengths and watch the reachable space change shape.", speak: false)

What value of L2 would give the largest reachable space according to you?

Show the 3d curve

Yeah, this is actually L1=L2, have you seen this somewhere?

Look at your arms, this is actually a feature human arms have.

Getting back to the IK problem, how could there be multiple solutions? In our case, 2? Try to reach a point in 2 different ways.

Each position within the reachable space is reachable, in 2 ways. The elbow of the robot can either be up or down leading to 2 solutions, this gives a different orientation of the gripper and is not fully equivalent in our case.

If the robot has more degrees of freedom than the space, the number of solutions can actually go to infinity.

Display a 3 dof robot and show that we can reach a point with different angles.

The solution for the IK can sometimes be found analytically.

In the 2 DOF example, one can invert the equations of the FK with a bit of maths, leading to the following equations.

The 2 elbow configurations depend on the sign in front of the acos function.

If the solution is not found analytically, or if there exists an infinity of solutions, we use numerical methods to approach the solution, the best known is Newton's iterative method, in which we repeat the following sequence until convergence:

OK, so now we fully know our robot's FK and IK, we can make it draw a circle!

From the equation of the circle with regard to time t, we know x and y, and obtain q1 and q2 for this.

Now think about LeRobot, when is IK used?

This actually depends on the teleoperator. Here is the SO-101 follower arm (make it pop in a 3d viewer)

If we use the phone as teleoperator, then we need IK.

But if we use another arm, let's say the SO-101 leader, the follower just has to copy-paste the joint angles directly, we say that planning is made in the joint space.

Classical robotics has focused on planning in the Cartesian space, but most of the recent Vision Language Action models, core of the imitation learning for vision, directly output joint goal positions.

Will this be transferable to every robot?

Most of them use an action expert separately from the VLA itself, which can be fine-tuned on any robot.
