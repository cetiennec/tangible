@chapter(Introduction)

Today we will discuss Forward and Inverse Kinematics on robot which is the art of working between the joint and the cartesian space. You'll be able to play with the simulation while I speak and pause to ask question.


@pause(prompt: "Turn both joints and watch where the tip goes.")

First look at our robot, the robot is said to be 2 degrees of freedom or 2 dof, it has 2 links and 2 motors that can move th angles q1 and q2.

The tip of the robot is called the end-effector.

See that @cue(q1 -> 2.4, over: 1.8s) @cue(q2 -> 5.2, over: 2.4s) changing the angles between 0 and 2pi directly affect end-effector position in (x,y) plane. So there exist a @board(fkx: $x = L_1 \cos q_1 + L_2 \cos(q_1+q_2)$) @board(fky: $y = L_1 \sin q_1 + L_2 \sin(q_1+q_2)$) mapping between radians and cm.

The relation between angles and end-effector position is called the Forward Kinematics or FK :
x = f(theta)

For serial robots, like ours, it can be obtained by modeling each joint position, 
For instance, motor 1 is at the base (0,0)
But motor 2 position depends on motor 1 angle:
And end effector position on motor 2 position + angle.

With this we have the full relation that gives angle to position


But when thinking of a trajectory, as humans, we think of the trajectory in the cartesian space, for instance, drawing a circle will give the following (x,y) equation : ..

But this does not tell us what motor action we should apply to the robot.

This is where the inverse kinematics (or Ik) problem comes in.
IK is the inverse relationship of FK, which is :
theta = f-1(x)

And this does not always have a solution or even a unique solution.

Pause and think a bit of cases where the number of solutions could be 0?

For our 2 dof robot, we either have 0 either have 2 solutions.

We have 0 solutions outside of the reachable space, which is all the points that the end effector can reach. 

(toggle the drawing)

Of course this reachable depends on the length of the links. Pause and play with the link length. 

What value of L2 would give the largest reachable space according to you?

Show the 3d curve

Yeah, this is actually L1=L2, have you seen this somewhere ?

Look at your arms, this is actually a feature humans arms have.

Getting back to the IK problem, how could there be multiple solution ? in our case, 2 ? Try to reach a point in 2 different ways.

Each position within the reachable space is reachable, in 2 ways. The elbow of the robot can either be up or down leading to 2 solutions, this gives a different orientation of the gripper and is not fully equivalent in our case.

If the robot has more degrees of freedom than the space, the number of solution can actually go to infinity.

Display a 3 dof robot and show that we can reach a point with different angles.

The solution for the IK can sometimes be found analytically,

in the 2dof example, one can invert the equations of the FK with a bit of maths leading to the following equations.

The 2 elbow configurations depends on the sign in front of the acos function.

If the solution is not found analytically, or if there exist an infinity of solution, we use numerical methods to approach the solution, the most known is Newton's iterative method in which we repeat the following sequence until convergence :

OK, so know we fully know our robot FK and IK, we can make it draw a circle !

From the equation of the circle with regard to the time t, we know x and y, and obtain q1 and q2 for this.

Now think about LeRobot, when is IK used?

This actually depends on the teleoperator, here is the SO101 follower arm (make it pop in a 3d viewer)

if we use the phone as teleoperator then we need the IK

But if we use another arm, let's say the SO101 leader, the follower just have to copy paste the joint angles directly, we say that planning is made in the joint space.

Classical robotics has focused on planning in the cartesian spacel, but most of the recent Vision Language Action models, core of the imitation learning for vision, directly output joint goal position.

Will this be transferable to every robot?

Most of them use an action expert separately to the VLA in itself which can be fine trained on any robot.
