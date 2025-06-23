const express = require('express')
const app = express();
const cors = require('cors')
require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const port = process.env.PORT || 8002

const corsOption = {
    origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'https://roadmap-ruby.vercel.app'],
    credentials: true,
    optionsSuccessStatus: 200,
}


// middleware
app.use(cors(corsOption))
app.use(express.json())
app.use(cookieParser())





const uri = `mongodb+srv://${process.env.DB_NAME}:${process.env.DB_PASS}@cluster0.afwrd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

// verifyToken a middleware
const verifyToken = (req, res, next) => {
    const token = req.cookies?.token
    if (!token) return res.status(401).send({ message: "Unauthorized access" })
    jwt.verify(token, process.env.SECRET_KEY, (err, decoded) => {
        if (err) return res.status(403).send({ message: "Unauthorized access" })
        req.user = decoded
    })

    next()
}

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();
        const database = client.db('roadmapDB')
        const userCollection = database.collection('users')
        const postCollection = database.collection('posts')

        //jwt token
        app.post('/jwt', (req, res) => {
            try {
                const { email } = req.body
                if (!email) return res.status(400).send({ message: 'Email is required' });
                // create token
                const token = jwt.sign({ email }, process.env.SECRET_KEY, { expiresIn: '1h' })
                console.log(token)
                res.cookie('token', token, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV == 'production',
                    sameSite: process.env.NODE_ENV == 'production' ? 'none' : 'strict'
                }).send({ success: true })
            } catch (error) {
                console.error('JWT Error:', error);
                res.status(500).send({ message: 'Failed to generate token', error: error.message });
            }
        })

        // clear jst token
        app.get('/logout', async (req, res) => {
            res.clearCookie('token', {
                maxAge: 0,
                secure: process.env.NODE_ENV == 'production',
                sameSite: process.env.NODE_ENV == 'production' ? 'none' : 'strict'
            }).send({ success: true })
        })



        // save all logged in user in the database
        app.post('/users', async (req, res) => {
            const userInfo = req.body
            const query = { email: userInfo?.email }
            const existingUser = await userCollection.findOne(query)
            if (existingUser) return res.send({ message: "User already exists", insertedId: null })
            const result = await userCollection.insertOne(userInfo)
            res.send(result);
        })

        // get logged in user info from database
        app.get('/users', async (req, res) => {
            const user = await userCollection.find().toArray()
            res.send(user);
        })

        // get user role by email
        app.get('/users/role/:email', verifyToken, async (req, res) => {
            const email = req.params.email
            // console.log(email)
            const query = { email }
            const result = await userCollection.findOne(query)
            // console.log(result)
            res.send({ role: result?.role });
        })

        // Get Single User by email
        app.get('/users/singleUser/:email', verifyToken, async (req, res) => {
            const { email } = req.params
            const result = await userCollection.findOne({ email })
            res.send(result);
        })

        // Creating a Post
        app.post('/post', verifyToken, async (req, res) => {
            const postData = req.body
            const result = await postCollection.insertOne(postData)
            res.send(result)
        })
        // Get all post and sort 
        app.get('/post', async (req, res) => {
            const { sortBy, sortOrder = 'asc', category } = req.query;

            let query = {};
            let options = {};
            if (category && ['TO DO', 'In Progress', 'Completed'].includes(category)) {
                query.category = category;
            }
            if (sortBy === 'likes') {
                options.sort = { 'likes.length': sortOrder === 'asc' ? 1 : -1 };
            }
            try {
                const result = await postCollection.find(query, options).toArray();
                res.send(result);
            } catch (error) {
                console.error('Error fetching posts:', error);
                res.status(500).send({ error: 'Failed to fetch posts' });
            }
        })




        // Get single post by id
        app.get('/post/single-post/:id', verifyToken, async (req, res) => {
            const { id } = req.params
            const query = { _id: new ObjectId(id) }
            const result = await postCollection.findOne(query)
            res.send(result)
        })

        // Update single post by id
        app.patch('/post/update-single-post/:id', verifyToken, async (req, res) => {
            const { id } = req.params
            const filter = { _id: new ObjectId(id) }
            const updateInfo = req.body
            const updateData = {
                $set: {
                    title: updateInfo?.title,
                    details: updateInfo?.details,
                    category: updateInfo?.category,
                }
            }
            const result = await postCollection.updateOne(filter, updateData)
            res.send(result)
        })

        // Delete a single post
        app.delete('/post/delete-single-post/:id', verifyToken, async (req, res) => {
            const { id } = req.params
            const query = { _id: new ObjectId(id) }
            const result = await postCollection.deleteOne(query)
            res.send(result)
        })

        // Add like and remove like from a post
        app.patch('/posts/like/:id', verifyToken, async (req, res) => {
            const { id } = req.params
            const { userEmail } = req.body
            if (!userEmail) return res.status(400).send({ message: "No user email provided" });
            const postId = { _id: new ObjectId(id) }
            const post = await postCollection.findOne(postId)
            if (!post) return res.status(404).send({ message: "Post not found" });
            let updateLike = [...(post.likes || [])]
            let updateDislike = [...(post.dislikes || [])]
            const alreadyLiked = updateLike.includes(userEmail)
            if (alreadyLiked) {
                updateLike = updateLike.filter(email => email !== userEmail)
            } else {
                updateLike.push(userEmail)
                updateDislike = updateDislike.filter(email => email !== userEmail);
            }
            await postCollection.updateOne(
                postId,
                { $set: { likes: updateLike, dislike: updateDislike } },
                { upsert: true }
            )
            return res.send({
                success: true,
                liked: !alreadyLiked,
                likesCount: updateLike.length
            })
        })

        // Add a Comment
        app.patch('/posts/add-comment/:id', verifyToken, async (req, res) => {
            const { id } = req.params
            const postId = { _id: new ObjectId(id) }
            const commentInfo = req.body
            const post = await postCollection.findOne(postId)
            if (!post) {
                return res.status(404).send({ message: "Post not found" });
            }

            const newComment = {
                _id: new ObjectId(),
                commentInfo,
                createdAt: new Date()
            };

            await postCollection.updateOne(
                postId,
                { $push: { comments: newComment } },
                { upsert: true }
            )
            res.send({ message: "Comment added successfully" });
        })

        // Update Post comment by using comment id
        app.patch('/post/update-comment/:postId/:commentId', verifyToken, async (req, res) => {
            const { postId, commentId } = req.params
            const { comment } = req.body
            if (!comment) return res.status(400).send({ message: "Updated comment required" });
            const result = await postCollection.updateOne({ _id: new ObjectId(postId), "comments._id": new ObjectId(commentId) },
                {
                    $set: { "comments.$.commentInfo.commentInfo.comment": comment }
                })
            res.send(result)
        })

        // Delete a Post comment by using comment id
        app.delete('/post/delete-comment/:postId/:commentId', verifyToken, async (req, res) => {
            const { postId, commentId } = req.params;
            const result = await postCollection.updateOne(
                { _id: new ObjectId(postId) },
                { $pull: { comments: { _id: new ObjectId(commentId) } } }
            );

            res.send(result);
        });





        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);



app.get('/', (req, res) => {
    res.send('Hello from Roadmap app Server....')
})

app.listen(port, () => console.log(`Server running on port ${port}`))