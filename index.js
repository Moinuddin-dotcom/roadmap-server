const express = require('express')
const app = express();
const cors = require('cors')
require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const port = process.env.PORT || 8002

// middleware
app.use(cors())
app.use(express.json())





const uri = `mongodb+srv://${process.env.DB_NAME}:${process.env.DB_PASS}@cluster0.afwrd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();
        const database = client.db('roadmapDB')
        const userCollection = database.collection('users')
        const postCollection = database.collection('posts')

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
        app.get('/users/role/:email', async (req, res) => {
            const email = req.params.email
            // console.log(email)
            const query = { email }
            const result = await userCollection.findOne(query)
            // console.log(result)
            res.send({ role: result?.role });
        })

        // Get Single User by email
        app.get('/users/singleUser/:email', async (req, res) => {
            const { email } = req.params
            const result = await userCollection.findOne({ email })
            res.send(result);
        })

        // Creating a Post
        app.post('/post', async (req, res) => {
            const data = req.body
            const result = await postCollection.insertOne(data)
            res.send(result)
        })

        app.get('/post', async (req, res) => {
            const result = await database.collection('posts').find().toArray()
            res.send(result)
        })
        // Get single post by id
        // app.get('/single-post/:id', async (req, res) => {
        //     const { id } = req.params
        //     const result = await database.collection('posts').findOne({ _id: ObjectId(id) })
        //     res.send(result)
        // })

        app.put('/posts/:id', async (req, res) => {
            const { id } = req.params
            const post = req.body
            const result = await database.collection('posts').updateOne({ _id: ObjectId(id) }, { $set: post })
            res.send(result)
        })

        app.delete('/posts/:id', async (req, res) => {
            const { id } = req.params
            const result = await database.collection('posts').deleteOne({ _id: ObjectId(id) })
            res.send(result)
        })

        app.patch('/posts/like/:id', async (req, res) => {
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

        // app.post('/posts/dislike/:id', async (req, res) => {
        //     const { id } = req.params
        //     const post = req.body
        //     const result = await database.collection('posts').updateOne({ _id: ObjectId(id) }, { $inc: { dislikes: 1 } })
        //     res.send(result)
        // })

        // Creating a Comment
        app.post('/comments', async (req, res) => {
            const comment = req.body
            const result = await database.collection('comments').insertOne(comment)
            res.send(result)
        })

        app.get('/comments', async (req, res) => {
            const result = await database.collection('comments').find().toArray()
            res.send(result)
        })

        app.get('/comments/:id', async (req, res) => {
            const { id } = req.params
            const result = await database.collection('comments').findOne({ _id: ObjectId(id) })
            res.send(result)
        })

        app.put('/comments/:id', async (req, res) => {
            const { id } = req.params
            const comment = req.body
            const result = await database.collection('comments').updateOne({ _id: ObjectId(id) }, { $set: comment })
            res.send(result)
        })





        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
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