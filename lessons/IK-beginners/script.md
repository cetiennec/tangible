@chapter(Introduction)

Today we will discuss Forward and Inverse Kinematics on robots, which is the art of working between the joint and the Cartesian space. You'll be able to play with the simulation while I speak and pause to ask questions.


@pause(prompt: "Turn both joints and watch where the tip goes.")

First look at our robot, the robot is said to be 2 degrees of freedom or 2 DOF, it has 2 links and 2 motors that can move the angles q1 and q2.

The tip of the robot is called the end-effector.

See that @cue(q1 -> 2.4, over: 1.8s) @cue(q2 -> 5.2, over: 2.4s) changing the angles between 0 and 2pi directly affects end-effector position in (x,y) plane. So there exists a @board(fkx: $x = L_1 \cos q_1 + L_2 \cos(q_1+q_2)$) @board(fky: $y = L_1 \sin q_1 + L_2 \sin(q_1+q_2)$) mapping between radians and cm.

