import React, { useEffect, useState } from 'react';
import './App.css';

function App() {
  // State to store photos
  const [photos, setPhotos] = useState([]);

  // Fetch photos from the Django backend when the component mounts
  useEffect(() => {
    fetch('http://localhost:8001/api/photos/')  // Replace with the actual endpoint URL
      .then(response => response.json())
      .then(data => setPhotos(data))
      .catch(error => console.error('Error fetching photos:', error));
  }, []);

  return (
    <div className="App">
      <h1>Photo Gallery</h1>
      <div className="gallery">
        {photos.map(photo => (
          <div key={photo.id} className="photo-card">
            <img src={`http://localhost:8001${photo.image}`} alt={photo.title} />
            <p>{photo.title}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
